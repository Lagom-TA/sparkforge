# SparkForge

**用自然语言描述想法，在可编辑的产品蓝图中梳理需求，在同一个工作区查看应用预览与源码。**

SparkForge 是一个面向数据管理类应用的 AI 构建工作台，将需求规划、应用构建、数据交互和版本管理组织成连贯的产品流程。

## 核心功能

- **对话式需求输入**：描述使用场景、数据字段和操作需求，启动应用规划。
- **可编辑产品蓝图**：在构建前确认数据结构与功能设计，让生成过程围绕清晰的需求展开。
- **双模型协作**：Planner 负责需求规划，Builder 负责应用规格与源码生成。
- **一体化工作区**：集中呈现对话、任务进度、蓝图、应用预览与源码，支持暂停、恢复和停止操作。
- **数据管理组件**：内置记录新增、编辑、删除、搜索、状态筛选与统计展示。
- **版本与分享**：提供历史版本浏览、只读预览与可撤销的分享链接。
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
PYTHONPATH=. python -m pytest -q tests/test_entity_access.py tests/test_aihub_access.py tests/test_aihub_parameters.py --asyncio-mode=auto
```

后端回归覆盖接口鉴权、实体所有权、记录生命周期、分享撤销与事务回滚。认证、模型和云端数据服务通过 Atoms 环境配置接入。
