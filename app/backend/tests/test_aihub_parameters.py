"""Prevent an omitted sampling option from becoming an incompatible temperature."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from schemas.aihub import ChatMessage, GenTxtRequest
from services.aihub import AIHubService


class MockStream:
    def __init__(self, chunks):
        self.chunks = chunks
        self.close = AsyncMock()

    def __aiter__(self):
        return self.chunks


def service_with(create):
    # No credentials or network: exercise the production request construction only.
    service = object.__new__(AIHubService)
    service.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return service

@pytest.mark.asyncio
async def test_default_temperature_is_omitted():
    create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{}'))], usage=None))
    request = GenTxtRequest(model='gpt-6-astra', messages=[ChatMessage(role='user',content='test')])
    await service_with(create).gentxt(request)
    assert 'temperature' not in create.call_args.kwargs

@pytest.mark.asyncio
async def test_explicit_temperature_is_preserved():
    create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{}'))], usage=None))
    request = GenTxtRequest(model='deepseek-v4-pro', messages=[ChatMessage(role='user',content='test')],temperature=0.3)
    await service_with(create).gentxt(request)
    assert create.call_args.kwargs['temperature'] == 0.3

@pytest.mark.asyncio
async def test_streaming_also_omits_default_temperature():
    async def chunks():
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='ok'))])
    create = AsyncMock(return_value=MockStream(chunks()))
    request = GenTxtRequest(model='gpt-6-astra', messages=[ChatMessage(role='user',content='test')],stream=True)
    assert [chunk async for chunk in service_with(create).gentxt_stream(request)] == ['ok']
    assert 'temperature' not in create.call_args.kwargs

@pytest.mark.asyncio
@pytest.mark.parametrize(('content', 'reason', 'expected'), [('', 'length', 'token 上限'), ('partial', 'length', 'token 上限'), ('', 'stop', '未返回正文'), ('', 'content_filter', '内容过滤')])
async def test_unusable_completion_is_not_reported_as_success(content, reason, expected):
    create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content), finish_reason=reason)], usage=None))
    request = GenTxtRequest(messages=[ChatMessage(role='user', content='test')])
    with pytest.raises(RuntimeError, match=expected):
        await service_with(create).gentxt(request)

@pytest.mark.asyncio
async def test_missing_choices_is_reported_clearly():
    create = AsyncMock(return_value=SimpleNamespace(choices=[], usage=None))
    request = GenTxtRequest(messages=[ChatMessage(role='user', content='test')])
    with pytest.raises(RuntimeError, match='候选结果'):
        await service_with(create).gentxt(request)


@pytest.mark.asyncio
@pytest.mark.parametrize('reason', ['length', 'content_filter'])
async def test_stream_rejects_partial_response_and_closes(reason):
    async def chunks():
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='partial'), finish_reason=None)])
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None), finish_reason=reason)])
    stream = MockStream(chunks())
    service = service_with(AsyncMock(return_value=stream))
    request = GenTxtRequest(messages=[ChatMessage(role='user', content='test')], stream=True)
    with pytest.raises(RuntimeError):
        _ = [chunk async for chunk in service.gentxt_stream(request)]
    stream.close.assert_awaited_once()
