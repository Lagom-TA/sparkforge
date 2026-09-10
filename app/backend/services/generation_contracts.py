"""Strict executable contracts; errors contain paths, never model/user values."""
import json
import re
from html.parser import HTMLParser
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
Key = Annotated[str, StringConstraints(pattern=r'^[a-z][a-z0-9_]{0,63}$')]


class ContractError(ValueError):
    def __init__(self, path, rule, code='invalid_contract'):
        self.path, self.rule, self.code = path, rule, code
        super().__init__(f'{path}: {rule}')


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Feature(StrictModel):
    name: Text
    description: Text
    priority: Literal['P0', 'P1']


class Page(StrictModel):
    name: Text
    purpose: Text


class Entity(StrictModel):
    name: Text
    fields: list[Text] = Field(min_length=1, max_length=30)


class Product(StrictModel):
    title: Text
    summary: Text
    audience: Text
    features: list[Feature] = Field(min_length=3, max_length=30)
    pages: list[Page] = Field(min_length=1, max_length=30)
    entities: list[Entity] = Field(max_length=30)
    acceptance: list[Text] = Field(min_length=3, max_length=30)
    outOfScope: list[Text] = Field(min_length=1, max_length=30)


class App(StrictModel):
    name: Text
    description: Text


class Metric(StrictModel):
    label: Text
    metric: Literal['count', 'completed', 'pending']


class AppField(StrictModel):
    key: Key
    label: Text
    type: Literal['text', 'textarea', 'number', 'date', 'select', 'boolean']
    required: bool = False
    options: list[Text] = Field(default_factory=list, max_length=30)


class Collection(StrictModel):
    key: Key
    label: Text
    fields: list[AppField] = Field(min_length=2, max_length=6)


class View(StrictModel):
    type: Literal['table', 'cards']
    collection: Key
    title: Text
    columns: list[Key] = Field(default_factory=list, max_length=30)


class Spec(StrictModel):
    runtime: Literal['crud']
    app: App
    navigation: list[Text] = Field(min_length=1, max_length=30)
    dashboard: list[Metric] = Field(max_length=30)
    collections: list[Collection] = Field(max_length=8)
    views: list[View] = Field(max_length=30)
    primaryAction: Text


class HtmlSpec(StrictModel):
    runtime: Literal['html']
    app: App
    requirements: list[Text] = Field(min_length=1, max_length=30)


def validate(model, value):
    try:
        return model.model_validate(value).model_dump(exclude_unset=True)
    except ValidationError as error:
        issue = error.errors(include_input=False, include_context=False, include_url=False)[0]
        path = '.'.join(map(str, issue['loc'])) or '$'
        raise ContractError(path, issue['type']) from None


def plan(value):
    return validate(Product, value)


def app_spec(value):
    if isinstance(value, dict) and value.get('runtime') == 'html':
        return validate(HtmlSpec, value)
    result = validate(Spec, value)
    if not result['collections'] or not result['views']:
        raise ContractError('collections/views', 'CRUD 应用至少需要一个集合和视图')
    collections = {}
    for i, collection in enumerate(result['collections']):
        path = f'collections.{i}'
        if collection['key'] in collections:
            raise ContractError(path + '.key', '集合键重复')
        fields = set()
        for j, field in enumerate(collection['fields']):
            fp = f'{path}.fields.{j}'
            if field['key'] in fields:
                raise ContractError(fp + '.key', '字段键重复')
            fields.add(field['key'])
            options = field.get('options')
            if field['type'] == 'select' and (not options or len(set(options)) != len(options)):
                raise ContractError(fp + '.options', '需要非空且不重复的选项')
            if field['type'] != 'select' and options is not None:
                raise ContractError(fp + '.options', '只有 select 字段允许 options')
        collections[collection['key']] = fields
    for i, view in enumerate(result['views']):
        if view['collection'] not in collections:
            raise ContractError(f'views.{i}.collection', '集合不存在')
        columns = view.get('columns')
        if columns is not None and (len(set(columns)) != len(columns) or set(columns) - collections[view['collection']]):
            raise ContractError(f'views.{i}.columns', '字段不存在或重复')
    if len(result['navigation']) != len(result['views']):
        raise ContractError('navigation', '导航项必须与视图一一对应')
    return result


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag)
        attrs = dict(attrs)
        if tag in ('iframe', 'frame', 'object', 'embed', 'base'):
            raise ContractError('files.index.html', f'不支持 {tag} 嵌入')
        if tag == 'script' and (attrs.get('src') or attrs.get('type', '').lower() not in ('', 'text/javascript', 'application/javascript')):
            raise ContractError('files.index.html', '仅支持内联经典 JavaScript，不支持模块或外部脚本')
        if tag == 'link' or (tag == 'meta' and attrs.get('http-equiv')):
            raise ContractError('files.index.html', '请内联样式，不能覆盖运行策略或自动跳转')


def source(value):
    if not isinstance(value, dict) or set(value) != {'files'} or not isinstance(value['files'], dict):
        raise ContractError('files', '需要源码文件对象')
    files = value['files']
    if any(not isinstance(v, str) or not v.strip() or len(v) > 180000 for v in files.values()):
        raise ContractError('files', '源码为空或超过 180000 字符')
    if 'index.html' in files:
        if set(files) != {'index.html'}:
            raise ContractError('files', 'HTML 应用必须是单文件')
        parser = Document()
        parser.feed(files['index.html'])
        if not {'html', 'head', 'body'} <= parser.tags or not files['index.html'].rstrip().lower().endswith('</html>'):
            raise ContractError('files.index.html', '需要完整 html/head/body 文档', 'incomplete_document')
    elif not files.get('src/App.tsx') or set(files) - {'src/App.tsx', 'src/index.css'}:
        raise ContractError('files', '缺少 src/App.tsx 或文件范围无效')
    return {'files': files}


def parse(content):
    content = content.strip()
    if content.startswith('```'):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    def pairs(items):
        obj = {}
        for k, v in items:
            if k in obj:
                raise ContractError('$', 'JSON 字段重复', 'invalid_json')
            obj[k] = v
        return obj
    def constant(_):
        raise ContractError('$', 'JSON 不允许非有限数值', 'invalid_json')
    try:
        return json.loads(content, object_pairs_hook=pairs, parse_constant=constant)
    except json.JSONDecodeError as error:
        raise ContractError(f'line:{error.lineno}:column:{error.colno}', 'JSON 不完整或语法错误', 'invalid_json') from None
