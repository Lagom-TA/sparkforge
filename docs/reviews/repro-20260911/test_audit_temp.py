import pytest
from test_generation_jobs import sessions, PLAN
from services.generation_jobs import Jobs

@pytest.mark.asyncio
async def test_stale_build_should_not_replace_new_draft(sessions):
    async with sessions() as db:
        jobs=Jobs(db,'alice')
        first=await jobs.save_draft(1,PLAN,'audit-draft-first',None,None)
        newer={**PLAN,'title':'用户已保存的新蓝图'}
        second=await jobs.save_draft(1,newer,'audit-draft-second',first['generation']['id'],None)
        stale=await jobs.start(1,'build','旧页面批准','audit-old-approve',PLAN)
        state=await jobs.snapshot(await jobs.find(second['generation']['id']))
        print('AUDIT',stale['generation']['product_spec']['title'],state['status'])
        assert state['status']=='awaiting_approval', 'stale build stopped latest saved draft'
