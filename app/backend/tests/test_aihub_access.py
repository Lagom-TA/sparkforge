"""Authentication must run before any billable AI service is constructed."""
from unittest.mock import Mock, AsyncMock
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from routers import aihub

@pytest.mark.asyncio
async def test_anonymous_text_request_never_constructs_provider(monkeypatch):
    provider = Mock(side_effect=RuntimeError('provider must not run'))
    monkeypatch.setattr(aihub, 'AIHubService', provider)
    app = FastAPI()
    app.include_router(aihub.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        result = await client.post('/api/v1/aihub/gentxt', json={'messages':[{'role':'user','content':'synthetic'}]})
    assert result.status_code == 401
    provider.assert_not_called()

@pytest.mark.asyncio
async def test_stream_starts_before_waiting_on_provider(monkeypatch):
    import asyncio
    from schemas.aihub import ChatMessage, GenTxtRequest
    provider = Mock()
    provider.client.close = AsyncMock()
    provider.gentxt_stream = Mock(side_effect=RuntimeError('not started yet'))
    monkeypatch.setattr(aihub, 'AIHubService', lambda: provider)
    response = await aihub.generate_text(GenTxtRequest(messages=[ChatMessage(role='user',content='synthetic')],stream=True))
    first = await asyncio.wait_for(anext(response.body_iterator), timeout=0.1)
    assert first == '{"content": ""}'
    provider.gentxt_stream.assert_not_called()
    await response.body_iterator.aclose()
