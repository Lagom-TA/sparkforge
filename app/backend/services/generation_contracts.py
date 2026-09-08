"""Validate model output before saving any executable product contract."""
import json
import re


def text(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 8000:
        raise ValueError("需要非空且长度合理的文本")
    return value.strip()


def sequence(value, minimum=1, maximum=30):
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError("列表长度不符合要求")
    return value


def plan(value):
    if not isinstance(value, dict):
        raise ValueError("蓝图必须是对象")
    result = {key: text(value.get(key)) for key in ('title', 'summary', 'audience')}
    for key, fields, minimum in [('features', ('name', 'description', 'priority'), 3), ('pages', ('name', 'purpose'), 2), ('entities', ('name', 'fields'), 1)]:
        result[key] = []
        for item in sequence(value.get(key), minimum):
            if not isinstance(item, dict):
                raise ValueError("蓝图条目必须是对象")
            row = {field: [text(v) for v in sequence(item.get(field))] if field == 'fields' else text(item.get(field)) for field in fields}
            if key == 'features' and row['priority'] not in ('P0', 'P1'):
                raise ValueError("功能优先级必须为 P0/P1")
            result[key].append(row)
    for key, minimum in [('acceptance', 3), ('outOfScope', 1)]:
        result[key] = [text(v) for v in sequence(value.get(key), minimum)]
    return result


def key(value):
    value = text(value)
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', value):
        raise ValueError("字段或集合键格式错误")
    return value


def app_spec(value):
    if not isinstance(value, dict) or not isinstance(value.get('app'), dict):
        raise ValueError("缺少应用定义")
    result = {'app': {k: text(value['app'].get(k)) for k in ('name', 'description')}, 'navigation': [text(v) for v in sequence(value.get('navigation'))], 'primaryAction': text(value.get('primaryAction')), 'dashboard': [], 'collections': [], 'views': []}
    for item in sequence(value.get('dashboard'), 0):
        if not isinstance(item, dict) or item.get('metric') not in ('count', 'completed', 'pending'):
            raise ValueError("统计指标不支持")
        result['dashboard'].append({'label': text(item.get('label')), 'metric': item['metric']})
    collections = {}
    for item in sequence(value.get('collections'), 1, 8):
        if not isinstance(item, dict):
            raise ValueError("集合必须是对象")
        name = key(item.get('key'))
        if name in collections:
            raise ValueError("集合键重复")
        fields = []
        for field in sequence(item.get('fields'), 2, 6):
            if not isinstance(field, dict) or field.get('type') not in ('text', 'textarea', 'number', 'date', 'select', 'boolean'):
                raise ValueError("字段类型不支持")
            row = {'key': key(field.get('key')), 'label': text(field.get('label')), 'type': field['type']}
            if 'required' in field:
                if type(field['required']) is not bool:
                    raise ValueError("required 必须是布尔值")
                row['required'] = field['required']
            if field['type'] == 'select':
                row['options'] = [text(v) for v in sequence(field.get('options'))]
                if len(set(row['options'])) != len(row['options']):
                    raise ValueError("选项重复")
            if row['key'] in {f['key'] for f in fields}:
                raise ValueError("字段键重复")
            fields.append(row)
        collections[name] = {f['key'] for f in fields}
        result['collections'].append({'key': name, 'label': text(item.get('label')), 'fields': fields})
    for item in sequence(value.get('views')):
        if not isinstance(item, dict) or item.get('type') not in ('table', 'cards') or item.get('collection') not in collections:
            raise ValueError("视图引用无效集合")
        row = {'type': item['type'], 'collection': item['collection'], 'title': text(item.get('title'))}
        if 'columns' in item:
            row['columns'] = [key(v) for v in sequence(item['columns'], 0)]
            if set(row['columns']) - collections[row['collection']]:
                raise ValueError("视图引用无效字段")
        result['views'].append(row)
    return result


def source(value):
    files = value.get('files') if isinstance(value, dict) else None
    if not isinstance(files, dict) or not isinstance(files.get('src/App.tsx'), str) or not files['src/App.tsx'].strip():
        raise ValueError("缺少 src/App.tsx")
    if set(files) - {'src/App.tsx', 'src/index.css'} or any(not isinstance(v, str) or len(v) > 60000 for v in files.values()):
        raise ValueError("源码文件不符合范围或大小限制")
    return {'files': files}


def parse(content):
    content = content.strip()
    if content.startswith('```'):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    return json.loads(content)
