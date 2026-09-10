from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
import json
import pytest
from services import generation_contracts as contracts
from services import generation_jobs as jobs
from services.generation_errors import StageError, diagnose
from test_generation_jobs import SPEC, PLAN

HTML = {'runtime':'html','app':{'name':'2048','description':'合并方块'},'requirements':['移动合并','保存恢复']}
GAME = (Path(__file__).parents[2] / 'frontend/tests/fixtures/2048.html').read_text()


def test_hard_cut_unknown_fields_and_path_diagnostics():
    with pytest.raises(contracts.ContractError,match='runtime'):
        contracts.app_spec({k:v for k,v in SPEC.items() if k!='runtime'})
    with pytest.raises(contracts.ContractError,match='game'):
        contracts.app_spec({**SPEC,'game':{}})
    bad=deepcopy(SPEC);bad['collections'][0]['fields'][0]['type']='grid'
    with pytest.raises(contracts.ContractError,match=r'collections.0.fields.0.type'):
        contracts.app_spec(bad)
    assert contracts.app_spec(HTML)==HTML
    assert contracts.source({'files':{'index.html':GAME}})


@pytest.mark.parametrize('content',['{"a":1,"a":2}','{"a":NaN}','{"a":'])
def test_invalid_json_is_categorized(content):
    with pytest.raises(contracts.ContractError) as error: contracts.parse(content)
    assert error.value.code=='invalid_json'


@pytest.mark.parametrize('extra',['<script src="https://example.com/a.js"></script>','<iframe></iframe>','<base href="https://example.com">','<meta http-equiv="refresh" content="0;url=https://example.com">'])
def test_external_document_dependencies_rejected(extra):
    with pytest.raises(contracts.ContractError):
        contracts.source({'files':{'index.html':f'<html><head>{extra}</head><body></body></html>'}})


@pytest.mark.asyncio
async def test_actual_generation_adapter_produces_interactive_source(monkeypatch):
    provider=SimpleNamespace(client=None,gentxt=AsyncMock(side_effect=[SimpleNamespace(content=json.dumps(HTML)),SimpleNamespace(content=GAME)]))
    monkeypatch.setattr(jobs,'AIHubService',lambda:provider)
    spec=await jobs.generate_stage('spec','2048',PLAN,{})
    source=await jobs.generate_stage('source','2048',PLAN,{'app_spec':spec})
    assert source['files']['index.html']==GAME.strip()
    assert provider.gentxt.call_args.args[0].max_tokens==16384


@pytest.mark.asyncio
async def test_retry_receives_precise_feedback_and_preserves_failed_output(monkeypatch):
    provider=SimpleNamespace(client=None,gentxt=AsyncMock(return_value=SimpleNamespace(content='{"runtime":')))
    monkeypatch.setattr(jobs,'AIHubService',lambda:provider)
    with pytest.raises(StageError) as error:
        await jobs.generate_stage('spec','2048',PLAN,{'diagnostic':{'code':'invalid_json','path':'line:1:column:5'}})
    diagnostic,content=diagnose(error.value)
    assert diagnostic['code']=='invalid_json'
    assert content=='{"runtime":'
    assert 'line:1:column:5' in provider.gentxt.call_args.args[0].messages[-1].content

@pytest.mark.parametrize('field',['columns','options'])
def test_explicit_null_does_not_cross_the_typescript_contract(field):
    value=deepcopy(SPEC)
    if field=='columns': value['views'][0]['columns']=None
    else: value['collections'][0]['fields'][0]['options']=None
    with pytest.raises(contracts.ContractError): contracts.app_spec(value)
