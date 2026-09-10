import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import get_db
from dependencies.auth import get_current_user
from models.projects import Projects
from models.versions import Versions
from models.runtime_state import RuntimeState
from models.version_verification import VersionVerification
from schemas.auth import UserResponse
from routers.runtime_state import router as state_router
from routers.version_verification import router as verification_router
from test_app_contracts import HTML
from test_generation_jobs import PLAN


@pytest.fixture
async def runtime():
    for column in Versions.__table__.columns:
        if column.type.__class__.__name__=='JSONB': column.type=JSON()
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as connection:
        for model in (Projects,Versions,RuntimeState,VersionVerification):
            await connection.run_sync(lambda conn,m=model:m.__table__.create(conn))
    async with async_sessionmaker(engine,expire_on_commit=False)() as db:
        db.add(Projects(id=1,user_id='alice',name='game',initial_prompt='2048',status='awaiting_verification',active_version_id=1))
        for ident in (1,2): db.add(Versions(id=ident,user_id='alice',project_id=1,version_number=ident,app_spec=HTML,product_spec=PLAN,source_bundle={'files':{}},change_summary='test'))
        await db.commit()
        app=FastAPI();app.include_router(state_router);app.include_router(verification_router)
        async def database(): yield db
        app.dependency_overrides[get_db]=database
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
            yield client,app,db
    await engine.dispose()


def login(app,user='alice'):
    app.dependency_overrides[get_current_user]=lambda:UserResponse(id=user,email=f'{user}@example.com')


@pytest.mark.asyncio
async def test_state_ownership_cas_and_history(runtime):
    client,app,db=runtime
    assert (await client.get('/api/v1/runtime-state/1')).status_code==401
    login(app,'bob')
    assert (await client.get('/api/v1/runtime-state/1')).status_code==404
    login(app)
    assert (await client.get('/api/v1/runtime-state/1')).json()=={'state':None,'revision':0}
    body={'revision':0,'state':{'board':[2,2,0,0],'score':0}}
    assert (await client.put('/api/v1/runtime-state/1',json=body)).json()=={'revision':1}
    assert (await client.get('/api/v1/runtime-state/1')).json()['state']==body['state']
    assert (await client.put('/api/v1/runtime-state/1',json=body)).status_code==409
    assert (await client.put('/api/v1/runtime-state/2',json=body)).status_code==409
    assert (await client.put('/api/v1/runtime-state/1',json={'revision':1,'state':'x'*100001})).status_code==413


@pytest.mark.asyncio
async def test_generated_is_not_accepted_and_owner_checks_are_required(runtime):
    client,app,db=runtime
    login(app)
    assert not (await client.get('/api/v1/version-verification/1')).json()['verified']
    assert (await client.put('/api/v1/version-verification/1',json={'checks':[True,False,True]})).status_code==422
    assert (await client.put('/api/v1/version-verification/2',json={'checks':[True]*3})).status_code==409
    result=await client.put('/api/v1/version-verification/1',json={'checks':[True]*3})
    assert result.json()=={'verified':True,'method':'owner'}
    assert (await db.get(Projects,1)).status=='ready'
    login(app,'bob')
    assert (await client.get('/api/v1/version-verification/1')).status_code==404

@pytest.mark.asyncio
async def test_acceptance_cannot_overwrite_a_running_project(runtime):
    client,app,db=runtime
    login(app)
    project=await db.get(Projects,1);project.status='building';await db.commit()
    response=await client.put('/api/v1/version-verification/1',json={'checks':[True]*3})
    assert response.status_code==409
    assert (await db.get(Projects,1)).status=='building'
