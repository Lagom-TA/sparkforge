from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from services.aihub import AIHubService, InvalidAudioInputError, InvalidImageInputError
from routers.aihub import bounded_call

@pytest.mark.asyncio
@pytest.mark.parametrize('value',['/etc/passwd','~/secret','http://127.0.0.1/private','https://example.com/audio.mp3'])
async def test_audio_rejects_paths_and_urls(value):
    with pytest.raises(InvalidAudioInputError): await object.__new__(AIHubService)._audio_str_to_upload_file(value)

@pytest.mark.asyncio
async def test_image_url_never_downloads():
    with pytest.raises(InvalidImageInputError): await object.__new__(AIHubService)._image_str_to_upload_file('http://127.0.0.1/private')

def test_data_uri_validates_encoding_and_size():
    for value in ['data:audio/wav;base64,***','data:audio/wav;base64,'+'A'*(20*1024*1024+1)]:
        with pytest.raises(InvalidImageInputError): AIHubService._parse_data_uri(value)

@pytest.mark.asyncio
async def test_timeout_maps_to_504_and_closes_client():
    service=SimpleNamespace(client=SimpleNamespace(close=AsyncMock()))
    async def timed_out(): raise TimeoutError()
    with pytest.raises(HTTPException) as error: await bounded_call(service,timed_out())
    assert error.value.status_code==504
    service.client.close.assert_awaited_once()
