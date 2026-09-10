# SparkForge AppSpec 与实际生成能力审查

审查日期：2026-09-09。代码基线：main / adef01a，开始时工作区干净。

范围：需求规划、构建提示词、模型响应处理、后端契约、任务失败与恢复、版本发布、预览和源码导出，以及对应测试。截图仅作为问题线索，未将其中的判断当作线上事实。本轮没有查询生产数据库、OneAPI 日志或调用真实模型，也没有修改业务代码。

## 结论

当前构建链路不能实现可玩的 2048。它的可执行能力是固定的数据集合 CRUD；模型没有生成棋盘、移动合并规则、键盘/触屏事件的输出和执行通道。仅放宽 JSON 校验或更换模型不能补齐此能力。

截图所述线上请求的精确失败原因尚不能确定。HTTP 200 不能证明正文完整、非空且符合应用契约；stage=spec、version=null 也无法区分上游正文异常、JSON 解析失败与字段校验失败。

## 确认的缺陷

### F1 · P1：规划接受的需求超出构建和运行能力

- 位置：app/backend/services/generation_jobs.py:206-213；app/backend/services/generation_contracts.py:43-84；app/backend/services/source_export.py:56-60。
- 规划只要求生成蓝图，没有检查蓝图中的功能是否可实现。构建强制 collections、每集合 2–6 字段、table/cards 视图，字段没有行为、状态转移或自定义渲染定义。
- source 阶段直接导出固定 React CRUD 模板，不调用模型编写应用逻辑；Workspace 使用 AppPreview 解释 app_spec，也不执行 source_bundle。
- 因此游戏需求可能在规划成功后校验失败，也可能被改写为分数管理表并显示成功。两种结果都无法交付游戏。
- 修复方向：在规划审批前建立能力判定；若产品要支持游戏和通用应用，需要扩展生成产物、运行机制与功能验收，不能只扩展枚举。

### F2 · P1：合法 AppSpec 的视图、导航和统计没有被兑现

- 位置：app/frontend/src/components/AppPreview.tsx:259-291、327-345；app/backend/services/source_export.py:27-49。
- 预览从 collections 生成导航，固定显示“全部记录/当前结果”和记录卡片，不消费 views.type、views.columns、navigation、dashboard。
- 导出固定表格及固定统计，同样不消费这些定义。用户要求 cards、指定展示列或 pending 统计，即使契约正确也不会获得对应行为。
- 本地比较：只改变 views、navigation、dashboard 后，导出文件除内嵌 spec 字面量之外的执行模板完全相同，模板没有读取上述三个字段。
- 修复方向：让预览与导出共享契约解释规则，并用行为验证覆盖视图、展示列、导航和统计。

### F3 · P1：版本成功条件只验证结构，不验证需求

- 位置：app/backend/services/generation_jobs.py:188-197、203-205；app/backend/services/generation_contracts.py:88-94。
- 蓝图 acceptance 只是提示词中的文本；源码导出后，只检查文件存在、文件名和长度，再直接发布为 succeeded/ready。
- 没有需求覆盖判断、应用行为验收或编译执行结果参与发布决策。一个合法的分数 CRUD AppSpec 可以作为“2048”的成功版本发布。
- 修复方向：区分契约有效、源码可运行和需求验收通过；成功状态必须有对应证据，不能将完成模板序列化等同于完成用户需求。

### F4 · P1：错误被合并，丢失本次故障的定位依据

- 位置：app/backend/services/generation_jobs.py:160-177、218-220；app/backend/services/generation_contracts.py:5-15、76-83。
- JSONDecodeError、契约 ValueError、上游正文截断/为空及模型服务异常，除超时外均变成“未通过校验或模型暂不可用”。任务日志仅记录异常类名，校验函数没有字段路径；失败正文及响应元信息不进入任务记录。
- 例如缺少 collections 只得到“列表长度不符合要求”；grid 视图却得到“视图引用无效集合”。这些提示无法确定失败字段和违反的规则。
- AIHub 对部分上游错误另有日志，因此不能笼统称所有错误都毫无记录；但后端契约失败的具体内容在 Jobs 层没有记录。
- 修复方向：保存分层错误码、校验路径、规则、阶段、尝试编号和可关联的请求元信息；如需保留正文，使用受限的内部诊断存储、脱敏和保留期限，不直接放入公开任务日志。

### F5 · P2：重试不携带校验反馈，无法纠正结构性失败

- 位置：app/backend/services/generation_jobs.py:105-123、210-220。
- resume 将失败任务改回 pending；下一次使用相同蓝图、模型、提示词和 4096 token 预算。没有失败输出或校验反馈进入修复请求，也不区分暂时性故障与能力不支持。
- 随机格式错误可能在重试后成功，但游戏能力缺失不会被重试补齐；截断也没有预算调整或输出压缩策略。用户会重复消耗调用而不知道何时应该停止。
- 修复方向：按错误分类决定重试；格式失败采用有次数上限的定向修复，能力不支持明确返回，保留每次尝试的证据。

### F6 · P2：未知语义字段被静默删除

- 位置：app/backend/services/generation_contracts.py:43-46、75-85。
- app_spec 构造新的白名单对象，并不拒绝额外字段。本地将 game 和 board 加入合法 CRUD AppSpec，校验成功，但返回结果不再包含 game/board。
- 这会把模型试图表达的规则丢弃后继续发布，掩盖能力不匹配。截图中“因为出现额外顶层字段而校验失败”的推断不适用于当前代码。
- 修复方向：对有功能含义的未知结构显式报出不支持，或纳入真实可执行契约；不能静默裁剪后宣告成功。

## 截图判断的校正

1. 当前生成任务实际调用 Python generation_contracts.app_spec；前端 Zod validateBuild 不在当前 buildProject 执行路径上，只在已有测试中被调用。因此应追踪后端校验路径，而不是寻找本次构建的 Zod path。
2. 缺少 collections、grid/game 视图、无效引用和 JSON 截断确实可以导致失败，但未取得当次输出，不能选定其中一项作为线上根因。
3. game/board 额外顶层字段会被删除，不是单凭出现它们就失败。
4. AIHub 已检查 finish_reason=length、content_filter 和空正文；问题是分类信息未保留在任务层，而不是完全没有截断检查。

## 本地验证与边界

使用 Python 标准库直接调用当前生产契约与源码导出函数，未使用网络或凭据：

| 输入/检查 | 实际结果 |
| --- | --- |
| 合法 CRUD spec | 校验通过 |
| 删除 collections | ValueError：列表长度不符合要求 |
| views[0].type=grid | ValueError：视图引用无效集合 |
| 合法 spec 增加 game、board | 校验通过，两个字段被删除 |
| 不完整 JSON | JSONDecodeError |
| 改变 views/navigation/dashboard | 除嵌入数据外模板相同，执行代码不读取这些定义 |

尝试运行现有后端 generation_jobs 与 aihub_parameters 测试，但当前默认 Python 3.14 没有 pytest，未能启动测试套件。没有将历史测试结果计作本轮通过，也没有执行数据库并发或线上回归。

现有 generation_jobs 测试大量 mock generate_stage，用于证明任务状态、租约和事务；它们不能证明真实模型输出符合契约或应用满足蓝图。前端 validateBuild 测试也不能替代当前后端契约测试。前后端限制另有差异，例如后端 navigation 至少一项、dashboard.metric 必填，前端允许空 navigation 和缺省 metric。

## 建议处理顺序

先补 F4 的诊断证据，并确定产品应支持的应用范围；随后解决 F1/F2/F3 的生成与执行能力闭环。F5/F6 随契约一并处理。只修改报错文案、放宽 schema、增加 token 或反复重试，都不足以完成 2048 的交付。

若要将本审查收敛为此次线上事件的精确根因，还需当次 generation ID 对应的部署版本、模型响应正文/结束原因及后端失败记录。本文确认的是当前代码缺陷，不声称已复现那一次真实上游响应。
