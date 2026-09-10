# 发布复审 · 2026-09-10

范围：本次通用 HTML 交互运行时、CRUD 契约与导出、持久化生成任务、状态存储和版本验收变更。接续 2026-09-09 审查报告。

## 复审补修

- 过期租约经 step 直接恢复时也检查三次尝试上限，避免跳过 control 的重试限制；超限保存明确的 attempt_limit 诊断并释放租约。
- 版本验收锁定项目后同时检查项目状态，禁止正在规划/构建时确认旧的活动版本，把项目状态覆盖成 ready。
- 两项都有独立回归测试。

## 发布前验证

- 后端 62 passed，无跳过，使用本轮独立 PostgreSQL 容器 localhost:55449/sparkforge_test。
- 前端 TypeScript strict、ESLint、生产构建通过；13 项浏览器回归通过。
- 浏览器测试使用可执行 2048 输入和模拟接口，不能当作真实模型/生产验收；首页测试仍记录无本地后端的代理连接拒绝。
- 生产构建入口：/assets/index-d7gK9Y6c.js。
- git diff --check 通过。

## 发布记录

待完成 GitHub 推送、Atoms 精确源码同步、新表结构更新、预览环境及正式域名实际验收后补充。本记录不保证未覆盖代码不存在缺陷。

## v33 真实预览发现与补修

- v33 已同步 61678b3 发布包；Atoms 执行迁移并核对新增两表，平台环境 TypeScript/Lint/13 项浏览器测试/生产构建通过。实际预览入口为 `/assets/index-B8d0kLSK.js`，与本地构建 hash 不同，记录为平台重新构建产物。
- 开发项目 4、任务 6 的真实 2048 蓝图请求两次 timeout；恢复后继续原任务、失败阶段和日志正确。正式域名尚未更新。
- 云端短探测：gpt-6-astra 2.468 秒、deepseek-v4-pro 1.946 秒返回有效正文。
- 同一原始需求、模型、4096 token 上限和 AIHubService.gentxt 的 A/B：原提示词 65.431 秒 APITimeoutError；追加精炼输出要求 42.559 秒返回 1637 字符、1035 completion tokens，并通过 Product 契约。该单次对比支持输出规模影响耗时，不能据此保证长期成功率。
- 补修：蓝图明确短描述、3–6 项核心功能和3–5项验收；HTML 源码要求复用逻辑和样式、减少冗余装饰与注释，同时完整实现所需功能。保留原有超时、重试上限和严格校验。
- 修正版继续部署与端到端验收，完成前不得把发布状态记为成功。

## v34 构建阶段限时补修

- 原任务6跨 v33→v34 恢复并成功生成蓝图；任务7 AppSpec 通过，source仍在客户端65秒超时。
- DeepSeek [官方参数文档](https://api-docs.deepseek.com/guides/thinking_mode/)说明默认开启 high thinking。
- 云端 source 对比使用同一任务输入，并追加精简结构、12000字符输出目标：low 思考65.394秒超时；thinking disabled 34.811秒返回9691字符、3371 completion tokens，finish_reason=stop，源码契约通过。此结果仍需浏览器玩法验证。
- 构建阶段明确使用 thinking disabled，规划模型保持原有设置；可选参数未指定时仍不向供应商发送。同步与流式调用都传递正确的 extra_body，增加两项传输边界回归。HTML单页游戏/工具增加简洁输出目标，完整功能仍是要求；服务端源码上限与隔离校验没有放宽。

## v35 源码输出协议补修

- 禁用 thinking 后两次真实源码及时返回，但均以 Markdown HTML 围栏包裹，触发 incomplete_document。失败证据来自任务7内部保存的11924字符原文：完整 html/head/body，末尾为代码围栏；任务按三次上限停止，没有隐藏失败或重置次数。
- 模型源码输出统一为 JSON SourceBundle，显式使用供应商 JSON 模式后解析、校验。删除原始 HTML 输出路径，不增加双协议兼容或放松文档/隔离校验。参数见 [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。
- 增加同步/流式 JSON 参数传输测试和非 JSON 源码拒绝测试；默认调用不附加 response_format。
