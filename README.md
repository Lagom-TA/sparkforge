# SparkForge

> 从一句需求到一个通过验收的可用应用。Schema 驱动的 AI 微应用生成平台（Atoms Demo 挑战）。

## 当前状态：P0 + P1 全部完成

已具备（无模型也能跑通的持久化闭环地基）：

- Next.js + TypeScript + Tailwind 应用骨架；
- **协议层**：`ProductSpec`（Planner 输出）与 `AppSpec`（Builder 输出 / 运行时输入），Zod 严格校验 + 引用一致性检查；
- **数据库 Schema**（`src/db/schema.sql`）：projects / generations / versions / app_records / verification_runs / share_links，含 RLS 与软删除；
- **Guest Session**：httpOnly cookie 签名会话，所有项目查询强制归属校验；
- **运行时 Data API**：按 AppSpec 白名单清洗字段（未知键丢弃、类型强制转换），CRUD + 软删除；
- **Preview Runtime**：AppSpec → 可交互表格/表单（新增、编辑、删除、搜索、空态、错误态）；
- **生成编排占位**：`/api/generate` 固化了请求/响应协议，Phase 3 接入 Planner。

Phase 3 新增：

- **LLM Provider Adapter**：OpenAI 兼容协议（GLM 等均可），服务端调用、超时与错误分类；
- **Planner Agent**：自然语言 → ProductSpec，Schema 校验失败自动让模型修复一次；
- **确定性编译器**：ProductSpec → AppSpec（不经过模型，批准即所见）；
- **编排**：`POST /api/projects/[id]/plan`（规划→待批准）、`POST /api/projects/[id]/build`（编译→落版本→激活），状态与公开日志写入数据库，刷新可恢复；
- **蓝图审批卡**：可编辑名称/说明/验收标准，支持 JSON 高级编辑，批准后右侧 Preview 立即可交互。

Phase 5–6 新增：

- **聊天增量修改**：工作台输入修改要求 → Planner 基于当前 ProductSpec 产出新蓝图（明确要求保留既有字段 key，避免破坏旧数据）→ 批准后生成新版本；
- **版本历史与切换**：V1/V2… 一键切换激活版本，应用数据归属项目、跨版本保留；
- **Verifier 确定性验收**：对激活版本在真实数据库上执行隔离 CRUD 验证（结构合法、新建、刷新后存在、编辑、删除），测试记录打标并在结束后清理，结果逐项显示通过/失败与证据，落库 `verification_runs`；
- **Preview / Tests 页签**：右栏随时运行验收并查看报告。

最新新增：

- **自动修复循环（验收驱动生成的最后一环）**：批准构建后立即自动验收；关键项失败时 Repairer 生成受约束的修复（仍为完整 ProductSpec，只针对失败项最小修改，不得删除既有字段），重新编译落版本并再次验收，最多两轮；超限保留最后版本并给出手动重试入口。全程写入公开日志；
- **公开分享链接**：`POST /api/projects/[id]/share` 签发 64 位 hex token（数据库只存 SHA-256 哈希），公开页 `/share/:projectId/:token` 无需登录即可访问激活版本；`interact` 权限可操作数据，`view` 只读（数据 API 服务端强制，写操作返回 403）；
- 数据 API 双通道归属校验：Guest 会话或 `x-share-token` 头。

最新新增（P1 收尾）：

- **Code 页签**：右栏第三个页签，展示激活版本的生成源文件（AppSpec → 确定性 React/TS 文件包，构建时落库 `versions.source_bundle`，旧版本即时生成兜底）；
- **登录**：`/auth` 邮箱验证码登录（Supabase Auth OTP，需 anon key）；归属按主体解析——登录用户按 `owner_id`，Guest 按 `guest_session_id`，Guest 数据登录后仍可访问；
- **构建中断恢复**：所有状态（蓝图、版本、日志）落库，刷新页面即恢复到中断前的阶段；蓝图保留时随时可重新"批准并构建"。

尚未接入：Google OAuth（邮箱 OTP 已覆盖登录需求）、代码导出 Zip（P2）。

## 启动

```bash
npm install
cp .env.example .env.local   # 填入 Supabase 配置
npm run dev
```

### 配置数据库

1. 在 [Supabase](https://supabase.com) 创建项目；
2. 在 SQL Editor 中执行 `src/db/schema.sql`；
3. 将 `Project URL` 与 `service_role key` 填入 `.env.local`（service key 只在服务端使用，不会进入浏览器）；
4. （可选）`src/db/seed/example-appspec.json` 是一个手工制作的示例 AppSpec，可用于本地验证 Preview Runtime。

模型服务：`.env.local` 中设置 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（OpenAI 兼容协议）。未配置时站点仍可用（浏览项目、查看已有版本），但无法生成新计划。

## 架构

```text
Browser → Next.js App Router
  ├─ /api/projects        项目 CRUD（Guest 隔离）
  ├─ /api/data/:pid/:col  运行时数据 API（AppSpec 白名单清洗）
  ├─ /api/projects/:id/plan   Planner 规划（→ 待批准蓝图）
  ├─ /api/projects/:id/build  批准并编译为版本（→ ready）
  ├─ /api/projects/:id/refine 聊天增量修改（→ 新蓝图待批准）
  ├─ /api/projects/:id/versions 版本列表与切换
  ├─ /api/projects/:id/verify Verifier 确定性验收
  ├─ /api/projects/:id/source 生成源文件（Code 页签）
  ├─ /api/projects/:id/share 签发公开分享 token
  └─ /share/:projectId/:token 公开访问页（免登录）/auth 邮箱登录
  └─ Preview Runtime      AppSpec → 交互式应用
Supabase / PostgreSQL
```

## 设计边界（重要）

本项目**不执行模型生成的任意代码**。模型输出被限制为经 Schema 校验的 AppSpec；
运行时只渲染白名单组件与字段类型，所有数据写入经归属校验的真实数据库。
这是有意为之的可靠性决策，详见执行方案文档。
