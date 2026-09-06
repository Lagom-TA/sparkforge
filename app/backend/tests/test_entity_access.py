"""HTTP access boundaries and relational validation on an isolated SQLite database.

SQLite is used only for ownership/validation assertions, not PostgreSQL concurrency.
"""
import importlib
import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base, get_db
from dependencies.auth import get_current_user
from models.projects import Projects
from models.versions import Versions
from models.app_records import App_records
from models.share_links import Share_links
from schemas.auth import UserResponse
from services.projects import ProjectsService
from services.app_records import App_recordsService
from services.share_links import Share_linksService

ENTITIES = ['projects', 'generations', 'versions', 'share_links', 'app_records']

@pytest.fixture
async def db():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    # These assertions do not exercise PG JSON operators.
    for model in (Versions, App_records):
        for column in model.__table__.columns:
            if column.type.__class__.__name__ == 'JSONB':
                column.type = JSON()
    async with engine.begin() as connection:
        await connection.run_sync(lambda conn: Base.metadata.create_all(conn, tables=[model.__table__ for model in (Projects, Versions, App_records, Share_links)]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        session.add_all([Projects(id=1, user_id='alice', name='A', initial_prompt='A', status='ready'), Projects(id=2, user_id='bob', name='B', initial_prompt='B', status='ready')])
        session.add(Versions(id=1, user_id='alice', project_id=1, version_number=1, product_spec={}, source_bundle={}, change_summary='test', app_spec={'collections':[{'key':'tasks','fields':[{'key':'title','label':'标题','type':'text','required':True},{'key':'count','label':'数量','type':'number'}]}]}))
        await session.commit()
        project = await session.get(Projects, 1)
        project.active_version_id = 1
        await session.commit()
        yield session
    await engine.dispose()

@pytest.fixture
def app(db):
    app = FastAPI()
    for entity in ENTITIES:
        app.include_router(importlib.import_module(f'routers.{entity}').router)
    async def database():
        yield db
    app.dependency_overrides[get_db] = database
    return app

@pytest.mark.asyncio
@pytest.mark.parametrize('entity', ENTITIES)
async def test_anonymous_cannot_enumerate_entities(app, entity):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        for suffix in ('', '/all', '/1'):
            response = await client.get(f'/api/v1/entities/{entity}{suffix}')
            assert response.status_code in (401, 404), response.text

@pytest.mark.asyncio
async def test_list_does_not_allow_overriding_owner(app):
    app.dependency_overrides[get_current_user] = lambda: UserResponse(id='alice', email='alice@example.com')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        result = await client.get('/api/v1/entities/projects', params={'query':'{"user_id":"bob"}'})
        assert result.status_code == 200
        assert result.json()['items'] == []
        assert (await client.get('/api/v1/entities/projects/2')).status_code == 404

@pytest.mark.asyncio
async def test_foreign_project_and_version_rejected(db):
    with pytest.raises(HTTPException) as error:
        await Share_linksService(db).create({'project_id':2, 'token':'test', 'permission':'view', 'is_active':True}, user_id='alice')
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        await ProjectsService(db).update(2, {'active_version_id':1}, user_id='bob')
    assert error.value.status_code == 400

@pytest.mark.asyncio
async def test_record_contract_and_immutable_collection(db):
    service = App_recordsService(db)
    payload = {'project_id':1,'collection_key':'tasks','record_key':'test','data':{'title':'Task','count':0},'is_deleted':False}
    record = await service.create(payload, user_id='alice')
    record_id = record.id
    for data in ({'title':''}, {'title':'Task','count':True}, {'title':'Task','injected':'x'}):
        with pytest.raises(HTTPException):
            await service.update(record_id, {'data':data}, user_id='alice')
    with pytest.raises(HTTPException):
        await service.update(record_id, {'collection_key':'other'}, user_id='alice')
    updated = await service.update(record_id, {'data':{'title':'Updated','count':1.5}}, user_id='alice')
    assert updated.data['count'] == 1.5

@pytest.mark.asyncio
async def test_batch_failure_rolls_back_earlier_items(app):
    app.dependency_overrides[get_current_user] = lambda: UserResponse(id='alice', email='alice@example.com')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/entities/share_links/batch', json={'items':[
            {'project_id':1,'token':'first','permission':'view','is_active':True},
            {'project_id':2,'token':'foreign','permission':'view','is_active':True},
        ]})
        assert response.status_code == 404
        result = await client.get('/api/v1/entities/share_links')
        assert result.json()['items'] == []

@pytest.mark.asyncio
async def test_record_http_lifecycle_and_cross_account_denial(app):
    account = {'id': 'alice'}
    app.dependency_overrides[get_current_user] = lambda: UserResponse(id=account['id'], email='synthetic@example.com')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        created = await client.post('/api/v1/entities/app_records', json={'project_id':1,'collection_key':'tasks','record_key':'lifecycle','data':{'title':'Synthetic','count':None},'is_deleted':False})
        assert created.status_code == 201, created.text
        record_id = created.json()['id']
        url = f'/api/v1/entities/app_records/{record_id}'
        account['id'] = 'bob'
        for response in [await client.get(url), await client.put(url, json={'data':{'title':'Foreign'}}), await client.delete(url)]:
            assert response.status_code == 404
        account['id'] = 'alice'
        updated = await client.put(url, json={'data':{'title':'Updated','count':1.5}})
        assert updated.status_code == 200
        assert (await client.get(url)).json()['data'] == {'title':'Updated','count':1.5}
        assert (await client.delete(url)).status_code == 200
        assert (await client.get(url)).status_code == 404

@pytest.mark.asyncio
async def test_public_share_is_minimal_read_only_and_revocable(app):
    from routers.public_share import router
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: UserResponse(id='alice', email='alice@example.com')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        created = await client.post('/api/v1/entities/share_links', json={'project_id':1,'token':'synthetic-share-token','permission':'view','is_active':True})
        assert created.status_code == 201, created.text
        share_id = created.json()['id']
        url = '/api/v1/public-share/1/synthetic-share-token'
        app.dependency_overrides.pop(get_current_user)
        snapshot = await client.get(url)
        assert snapshot.status_code == 200
        assert set(snapshot.json()) == {'project','version'}
        assert 'user_id' not in snapshot.json()['project']
        assert 'source_bundle' not in snapshot.json()['version']
        assert (await client.post(url, json={})).status_code == 405
        app.dependency_overrides[get_current_user] = lambda: UserResponse(id='alice', email='alice@example.com')
        assert (await client.put(f'/api/v1/entities/share_links/{share_id}', json={'is_active':False})).status_code == 200
        app.dependency_overrides.pop(get_current_user)
        assert (await client.get(url)).status_code == 404
