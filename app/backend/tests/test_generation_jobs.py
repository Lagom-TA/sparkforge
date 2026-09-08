"""Real PostgreSQL locks/transactions on isolated localhost:55439 test database."""
import asyncio
import os
from datetime import timedelta
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models.projects import Projects
from models.generations import Generations
from models.versions import Versions
from models.generation_jobs import GenerationJob
from services.generation_jobs import Jobs, now
from services import generation_jobs as module
from services import generation_contracts as contracts

PLAN = dict(title='任务管理',summary='管理记录',audience='团队',features=[dict(name=str(i),description='管理',priority='P0') for i in range(3)],pages=[dict(name=str(i),purpose='查看') for i in range(2)],entities=[dict(name='任务',fields=['名称'])],acceptance=['新增','修改','删除'],outOfScope=['支付'])
SPEC = dict(app=dict(name='任务',description='任务管理'),navigation=['记录'],dashboard=[dict(label='记录',metric='count')],collections=[dict(key='tasks',label='任务',fields=[dict(key='title',label='名称',type='text'),dict(key='done',label='完成',type='boolean')])],views=[dict(type='table',collection='tasks',title='任务',columns=['title','done'])],primaryAction='新增')
SOURCE = {'files': {'src/App.tsx': 'export default function App(){return null;}'}}

@pytest.fixture
async def sessions():
    url=os.environ.get('SPARKFORGE_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set SPARKFORGE_TEST_DATABASE_URL to an isolated PostgreSQL test database')
    from sqlalchemy.engine import make_url
    parsed=make_url(url)
    assert parsed.host in ('127.0.0.1','localhost') and parsed.database=='sparkforge_test', 'Refuse non-local or non-test database'
    engine=create_async_engine(url)
    tables=[Projects.__table__,Generations.__table__,Versions.__table__,GenerationJob.__table__]
    async with engine.begin() as connection:
        for table in reversed(tables): await connection.run_sync(lambda conn,t=table:t.drop(conn,checkfirst=True))
        for table in tables: await connection.run_sync(lambda conn,t=table:t.create(conn))
        await connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_versions_project_number ON versions(project_id,version_number)'))
    factory=async_sessionmaker(engine,expire_on_commit=False)
    async with factory() as db:
        db.add_all([Projects(id=1,user_id='alice',name='A',initial_prompt='A',status='intake'),Projects(id=2,user_id='bob',name='B',initial_prompt='B',status='intake')]);await db.commit()
    yield factory
    await engine.dispose()

async def start(sessions,kind='plan',key='request-000000001'):
    async with sessions() as db: return await Jobs(db,'alice').start(1,kind,'synthetic',key,PLAN if kind=='build' else None)

@pytest.mark.asyncio
async def test_admission_idempotency_and_owner(sessions):
    first=await start(sessions)
    assert (await start(sessions))['generation']['id']==first['generation']['id']
    async with sessions() as db:
        with pytest.raises(HTTPException) as error: await Jobs(db,'bob').find(first['generation']['id'])
        assert error.value.status_code==404
    async with sessions() as db:
        with pytest.raises(HTTPException) as error: await Jobs(db,'alice').start(1,'plan','changed','request-000000001')
        assert error.value.status_code==409
    with pytest.raises(HTTPException) as error: await start(sessions,key='request-000000002')
    assert error.value.status_code==409

@pytest.mark.asyncio
async def test_concurrent_start_only_admits_one(sessions):
    results=await asyncio.gather(start(sessions,key='request-000000001'),start(sessions,key='request-000000002'),return_exceptions=True)
    assert sum(isinstance(r,dict) for r in results)==1
    assert sum(isinstance(r,HTTPException) and r.status_code==409 for r in results)==1

@pytest.mark.asyncio
async def test_stop_fences_late_result_without_holding_transaction(sessions,monkeypatch):
    job=await start(sessions);entered,finish=asyncio.Event(),asyncio.Event()
    async def model(*args): entered.set();await finish.wait();return PLAN
    monkeypatch.setattr(module,'generate_stage',model)
    async with sessions() as db:
        task=asyncio.create_task(Jobs(db,'alice').step(job['generation']['id']))
        await asyncio.wait_for(entered.wait(),1)
        async with sessions() as other:
            assert (await asyncio.wait_for(Jobs(other,'alice').control(job['generation']['id'],'stopped'),1))['status']=='stopped'
        finish.set();assert (await task)['status']=='stopped'
    async with sessions() as db: assert (await db.get(Generations,job['generation']['id'])).product_spec is None

@pytest.mark.asyncio
async def test_duplicate_steps_call_model_once(sessions,monkeypatch):
    job=await start(sessions);entered,finish=asyncio.Event(),asyncio.Event();calls=[]
    async def model(*args): calls.append(1);entered.set();await finish.wait();return PLAN
    monkeypatch.setattr(module,'generate_stage',model)
    async with sessions() as db:
        task=asyncio.create_task(Jobs(db,'alice').step(job['generation']['id']))
        await asyncio.wait_for(entered.wait(),1)
        async with sessions() as other: assert (await Jobs(other,'alice').step(job['generation']['id']))['status']=='running'
        finish.set();await task
    assert calls==[1]

@pytest.mark.asyncio
async def test_resume_saved_stage_publish_once(sessions,monkeypatch):
    job=await start(sessions,'build');model=AsyncMock(side_effect=[SPEC,TimeoutError(),SOURCE]);monkeypatch.setattr(module,'generate_stage',model)
    async with sessions() as db:
        jobs=Jobs(db,'alice');ident=job['generation']['id']
        assert (await jobs.step(ident))['stage']=='source'
        assert (await jobs.step(ident))['status']=='failed'
        await jobs.control(ident,'resume');done=await jobs.step(ident)
        assert done['status']=='succeeded'
        assert (await jobs.step(ident))['version']['id']==done['version']['id']
        assert (await db.get(Projects,1,populate_existing=True)).active_version_id==done['version']['id']
        assert await db.scalar(select(func.count()).select_from(Versions))==1
    assert [c.args[0] for c in model.call_args_list]==['spec','source','source']

@pytest.mark.asyncio
async def test_expired_lease_recovers(sessions,monkeypatch):
    job=await start(sessions)
    async with sessions() as db:
        row=await Jobs(db,'alice').find(job['generation']['id']);row.status='running';row.lease_token='dead-worker';row.lease_until=now()-timedelta(seconds=1);await db.commit()
        monkeypatch.setattr(module,'generate_stage',AsyncMock(return_value=PLAN))
        assert (await Jobs(db,'alice').step(job['generation']['id']))['status']=='awaiting_approval'

@pytest.mark.asyncio
async def test_publication_rollback_has_no_partial_version(sessions,monkeypatch):
    job=await start(sessions,'build');monkeypatch.setattr(module,'generate_stage',AsyncMock(side_effect=[SPEC,SOURCE]))
    async with sessions() as db:
        jobs=Jobs(db,'alice');ident=job['generation']['id'];await jobs.step(ident);original=jobs.snapshot
        async def fail(job):
            if job.version_id: raise RuntimeError('simulated failure after insert')
            return await original(job)
        monkeypatch.setattr(jobs,'snapshot',fail)
        with pytest.raises(RuntimeError): await jobs.step(ident)
        await db.rollback()
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Versions))==0
        assert (await db.get(Projects,1)).active_version_id is None

def test_contract_rejects_broken_model():
    assert contracts.plan(PLAN)==PLAN
    assert contracts.app_spec(SPEC)==SPEC
    with pytest.raises(ValueError): contracts.app_spec({**SPEC,'views':[dict(type='table',collection='missing',title='bad')]})
    with pytest.raises(ValueError): contracts.source({'files':{'../../secret':'x'}})

@pytest.mark.asyncio
async def test_legacy_writes_cannot_bypass_jobs(sessions):
    from services.generations import GenerationsService
    from services.versions import VersionsService
    from services.projects import ProjectsService
    async with sessions() as db:
        for service in (GenerationsService(db),VersionsService(db)):
            for operation in (service.create({},user_id='alice'),service.update(1,{},user_id='alice'),service.delete(1,user_id='alice')):
                with pytest.raises(HTTPException) as error: await operation
                assert error.value.status_code==409
        with pytest.raises(HTTPException) as error: await ProjectsService(db).update(1,{'status':'ready'},user_id='alice')
        assert error.value.status_code==409

@pytest.mark.asyncio
async def test_new_task_supersedes_paused_old_one(sessions,monkeypatch):
    old=await start(sessions)
    async with sessions() as db: await Jobs(db,'alice').control(old['generation']['id'],'paused')
    new=await start(sessions,key='request-000000002')
    async with sessions() as db:
        assert (await Jobs(db,'alice').control(old['generation']['id'],'resume'))['status']=='stopped'
        assert (await Jobs(db,'alice').find(new['generation']['id'])).status=='pending'

@pytest.mark.asyncio
async def test_job_routes_reject_anonymous_before_service():
    from fastapi import FastAPI
    from httpx import ASGITransport,AsyncClient
    from routers.generation_jobs import router
    from core.database import get_db
    app=FastAPI();app.include_router(router)
    async def db(): yield None
    app.dependency_overrides[get_db]=db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get('/api/v1/generation-jobs/1')).status_code==401
        assert (await client.post('/api/v1/generation-jobs/1/step')).status_code==401

@pytest.mark.asyncio
async def test_stage_deadline_cancels_slow_provider(monkeypatch):
    entered=asyncio.Event()
    async def slow(*args): entered.set();await asyncio.Event().wait()
    provider=type('Provider',(),{'gentxt':staticmethod(slow),'client':None})()
    monkeypatch.setattr(module,'AIHubService',lambda:provider)
    monkeypatch.setattr(module,'STEP_SECONDS',0.01)
    with pytest.raises(TimeoutError): await module.generate_stage('plan','synthetic',None,{})
    assert entered.is_set()
