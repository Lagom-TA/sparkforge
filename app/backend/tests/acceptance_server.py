"""Local-only HTTP acceptance harness. Real DB/routes; synthetic identity and model.

Never used by main.py. Requires explicit isolated database and opt-in.
"""
import os
import asyncio
import importlib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base, get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.projects import Projects
from services import generation_jobs
from test_generation_jobs import PLAN, SPEC

url = os.environ['SPARKFORGE_TEST_DATABASE_URL']
parsed = make_url(url)
assert os.environ.get('SPARKFORGE_ACCEPTANCE') == '1'
assert parsed.host in ('localhost','127.0.0.1') and parsed.database == 'sparkforge_test'
engine = create_async_engine(url)
sessions = async_sessionmaker(engine, expire_on_commit=False)
COUNTER = '''<!doctype html><html><head><title>验收计数器</title></head><body><h1>验收计数器</h1><output id="count">加载中</output><button id="add" disabled>加一</button><button id="reset" disabled>归零</button><script>
let count=0;let queue=Promise.resolve();const out=document.getElementById('count');
function change(next){queue=queue.then(async()=>{await sparkforge.saveState({count:next});count=next;out.textContent=count;}).catch(e=>{document.body.append(String(e));});}
(async()=>{const state=await sparkforge.loadState();count=state?.count??0;out.textContent=count;document.getElementById('add').disabled=false;document.getElementById('reset').disabled=false;})();
document.getElementById('add').onclick=()=>change(count+1);document.getElementById('reset').onclick=()=>change(0);
</script></body></html>'''

async def model(stage, request, plan, payload):
    await asyncio.sleep(0.5)
    if stage=='plan': return {**PLAN,'title':'验收计数器','acceptance':['加一正确','刷新恢复','归零正确']}
    if stage=='spec':
        if plan['title'].startswith('CRUD'): return SPEC
        return {'runtime':'html','app':{'name':plan['title'],'description':'端到端验收'},'requirements':plan['acceptance']}
    # The first candidate intentionally fails, exercising real browser rejection and regeneration.
    if payload.get('attempts',{}).get('source')==1:
        return {'files':{'index.html':'<html><head></head><body><script>const count = ;</script></body></html>'}}
    return {'files':{'index.html':COUNTER}}

generation_jobs.generate_stage_original = generation_jobs.generate_stage
async def generate(stage, request, plan, payload):
    if stage=='source' and payload['app_spec']['runtime']=='crud':
        return await generation_jobs.generate_stage_original(stage, request, plan, payload)
    return await model(stage, request, plan, payload)
generation_jobs.generate_stage=generate

async def reset_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        db.add(Projects(id=1,user_id='acceptance',name='完整链路验收',initial_prompt='制作一个计数器，支持加一、归零和刷新恢复。',status='intake'))
        await db.commit()


@asynccontextmanager
async def lifespan(app):
    await reset_database()
    yield
    await engine.dispose()

app=FastAPI(lifespan=lifespan)
for name in ('projects','versions','generations','generation_jobs','runtime_state','version_verification','app_records','share_links','public_share'):
    app.include_router(importlib.import_module('routers.'+name).router)
async def database():
    async with sessions() as db: yield db
user=UserResponse(id='acceptance',email='acceptance@example.invalid',role='user')
app.dependency_overrides[get_db]=database
app.dependency_overrides[get_current_user]=lambda:user
@app.get('/api/v1/auth/me')
async def me(): return user
@app.get('/api/config')
async def config(): return {'API_BASE_URL':''}

@app.post('/__acceptance/reset')
async def reset():
    await reset_database()
    return {'reset': True}
