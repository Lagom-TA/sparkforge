"""Stable, safe diagnostics for generation attempts."""
import hashlib
from openai import APIConnectionError, APIStatusError, APITimeoutError
from services.generation_contracts import ContractError


class CompletionError(RuntimeError):
    def __init__(self, code, message, content=None):
        self.code, self.content = code, content
        super().__init__(message)


class StageError(RuntimeError):
    def __init__(self, cause, content=None):
        self.cause = cause
        self.content = content
        super().__init__(type(cause).__name__)


def diagnose(error):
    content = None
    if isinstance(error, StageError):
        content, error = error.content, error.cause
    if content is None and isinstance(error, CompletionError):
        content = error.content
    if isinstance(error, ContractError):
        code, message, retryable = error.code, str(error), error.code != 'data_conflict'
    elif isinstance(error, (TimeoutError, APITimeoutError)):
        code, message, retryable = 'timeout', '模型响应超时，可恢复当前步骤。', True
    elif isinstance(error, CompletionError):
        code, message, retryable = error.code, str(error), error.code not in ('content_filter', 'provider_configuration')
    elif isinstance(error, APIConnectionError):
        code, message, retryable = 'provider_connection', '无法连接模型服务，可恢复当前步骤。', True
    elif isinstance(error, APIStatusError):
        retryable = error.status_code in (408, 409, 429) or error.status_code >= 500
        code, message = f'provider_http_{error.status_code}', '模型服务请求失败。' if retryable else '模型配置或权限不满足要求，请检查服务配置。'
    else:
        code, message, retryable = 'internal_error', '生成服务发生内部错误，请根据任务编号排查。', False
    result = {'code': code, 'message': message, 'retryable': retryable}
    if isinstance(error, ContractError):
        result['path'] = error.path
    if content is not None:
        result.update(response_length=len(content), response_sha256=hashlib.sha256(content.encode()).hexdigest())
    return result, content
