# SparkForge

**用自然语言描述想法，在可编辑的产品蓝图中梳理需求，在同一个工作区查看应用预览与源码。**

SparkForge 是一个支持数据管理与浏览器交互应用的 AI 构建工作台，将需求规划、应用构建、数据交互和版本管理组织成连贯的产品流程。

## 核心功能

- **对话式需求输入**：描述使用场景、数据字段和操作需求，启动应用规划。
- **可编辑产品蓝图**：在构建前确认数据结构与功能设计，让生成过程围绕清晰的需求展开。
- **双模型协作**：Planner 负责需求规划，Builder 负责应用规格与源码生成。
- **一体化工作区**：集中呈现对话、任务进度、蓝图、应用预览与源码，支持暂停、恢复和停止操作。
- **通用交互应用**：生成并隔离运行单文件 HTML/CSS/JavaScript，支持游戏、计算器、画布与工具，提供版本隔离的云端状态保存。
- **显式功能验收**：源码生成后进入待验收状态，用户逐项实际操作确认后才标记为已验收。
- **数据管理组件**：内置记录新增、编辑、删除、搜索、状态筛选与统计展示。
- **版本与分享**：提供历史版本浏览、可交互的公开演示与可撤销的分享链接；公开演示不读取项目业务数据。HTML 源码可下载独立运行，下载副本使用本机存储。
- **个性化体验**：支持设备预览、紧凑布局、减少动效和偏好持久化。

阅读 [项目介绍与实现思路](docs/PROJECT_NOTES.md)。

## 技术架构

前端采用 React、TypeScript、Vite 和 shadcn/ui；后端采用 FastAPI，通过 Atoms 接入认证、云端数据与模型服务。结构化规格连接需求规划与界面渲染，前后端共同处理字段校验、实体关联和访问权限。

```text
app/frontend/   页面、工作区、预览组件与前端测试
app/backend/    API、数据模型、业务校验与后端测试
docs/           项目说明与工程记录
```

## 本地开发

### 前端

```sh
cd app/frontend
pnpm install --frozen-lockfile
pnpm run dev --host 127.0.0.1
```

### 质量检查

```sh
cd app/frontend
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:review
```

前端回归覆盖结构校验、表单交互、响应式布局与生成状态处理。

在 Python 虚拟环境中安装 `app/backend/requirements.txt` 后运行后端回归：

```sh
cd app/backend
PYTHONPATH=. python -m pytest -q tests --asyncio-mode=auto
```

后端回归覆盖接口鉴权、实体所有权、记录生命周期、分享撤销与事务回滚。认证、模型和云端数据服务通过 Atoms 环境配置接入。

## 运行契约与发布

构建只接受两种明确的 AppSpec：`runtime: crud` 与 `runtime: html`。不支持旧字段回退或旧任务适配。HTML 应用使用内联经典 JavaScript，在不授予主站同源权限的 iframe 中执行；通过 `window.sparkforge.loadState()` / `saveState(value)` 保存最多 100KB 的版本状态。并发修改会报冲突，历史版本不能覆盖活动版本的数据。

新结构不能使已有业务记录失效；发布时会验证当前数据，发生冲突则保留原活动版本和记录，要求调整应用结构或处理数据。

HTML 运行时支持前端交互，不提供任意服务器部署、外部网络集成、支付或第三方登录。生成代码的功能仍需验收，不能把类型检查或结构校验当作业务正确性的证明。

本次数据库新增 `runtime_states`、`version_verifications`，部署前应用 `20260909_runtime_state` 迁移，并同步部署前后端。旧契约产物需要重新生成，不执行自动数据迁移或兼容转换。

PostgreSQL 并发回归需要显式指定隔离测试库：`SPARKFORGE_TEST_DATABASE_URL=postgresql+asyncpg://postgres@127.0.0.1:55439/sparkforge_test`。测试会重建测试表，只允许 localhost 上名为 sparkforge_test 的数据库。

本次实现和验收边界见 [代码质量修复记录](docs/reviews/2026-09-09-code-quality-fix.md)。
