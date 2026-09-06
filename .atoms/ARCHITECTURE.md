---
last_updated: 2026-09-04T06:26:19Z
---

# Architecture Design

## System Overview
SparkForge 是一个前后端分离的 AI 应用生成平台。React 客户端负责认证、项目管理、需求规划、生成进度、应用预览、源码查看、版本切换和分享；Atoms Cloud 负责用户隔离的数据持久化；AI 规划与代码生成通过内置 AI 能力执行，生成结果以结构化规格和源码包保存。

## Tech Stack
- 前端：React 18、TypeScript、Vite、React Router、Tailwind CSS、shadcn/ui
- 后端：Atoms Cloud、FastAPI 自动路由、PostgreSQL 实体
- 客户端集成：`@metagptx/web-sdk`
- AI：`gpt-6-astra` 用于需求理解与产品规划，`deepseek-v4-pro` 用于源码生成、优化和错误修复

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| 应用路由 | 首页、工作区、分享、设置与认证回调 | `app/frontend/src/App.tsx` |
| 产品首页 | 产品介绍、认证入口、项目列表和创建入口 | `app/frontend/src/pages/Index.tsx` |
| 项目工作区 | 规划审批、构建状态、预览、源码和版本管理 | `app/frontend/src/pages/Workspace.tsx` |
| 分享视图 | 通过分享令牌展示只读项目成果 | `app/frontend/src/pages/Share.tsx` |
| 数据与认证 | Web SDK 认证、项目、生成、版本和分享实体访问 | `app/frontend/src/lib/sparkforge.ts` |
| 生成编排 | 结构化蓝图、代码生成、角色时间线与版本持久化 | `app/frontend/src/lib/generation.ts` |
| 受控运行时 | 根据 AppSpec 渲染表单、列表、卡片、筛选、统计与真实 CRUD | `app/frontend/src/components/AppPreview.tsx` |
| 数据模型 | 用户隔离的项目、生成、版本、分享和运行时记录 | `app/backend/models/` |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| 前端框架 | React + Vite + shadcn/ui | 符合平台支持边界并提供成熟的产品界面组件 |
| 后端平台 | Atoms Cloud | 统一承载认证、数据库和 AI，避免外部密钥与重复认证 |
| AI 调用方式 | 前端 Web SDK 分步调用 | 规划与代码生成可独立重试，并避免长链式服务端请求超时 |
| 规划模型 | `gpt-6-astra` | 满足已确认的需求理解与产品规格规划要求 |
| 编码模型 | `deepseek-v4-pro` | 使用当前受支持的高质量国产文本生成模型 |
| 生成产物 | 结构化 AppSpec 与源码文件映射 | 可验证、可预览、可追踪版本，避免执行任意生成代码 |
| 视觉方向 | 暖白、对话优先的 Product 界面 | 参考 Codex、Claude Code 与 Notion，让需求输入成为一级入口，工作台和产物面板保持次级层级 |

## File Tree Plan
- `app/frontend/src/App.tsx`：应用路由与全局提供器
- `app/frontend/src/pages/Index.tsx`：首页和项目入口
- `app/frontend/src/pages/Workspace.tsx`：核心生成工作区
- `app/frontend/src/pages/Share.tsx`：公开只读分享
- `app/frontend/src/pages/Settings.tsx`：模型和工作区说明
- `app/frontend/src/components/AppPreview.tsx`：结构化应用预览
- `app/frontend/src/lib/sparkforge.ts`：类型、实体访问和认证
- `app/frontend/src/lib/generation.ts`：AI 规划与源码生成
- `app/frontend/src/index.css`：设计令牌和全局样式

## Implementation Guide
1. 登录与会话读取使用 Atoms Cloud 的 `client.auth.me/toLogin/login`；注销通过删除本地 `token` 并设置 `isLougOutManual=true` 完成，避免 SDK 0.0.77 调用持续返回 500 的注销端点。
2. 所有实体 CRUD 使用 `client.entities.*`，写入数据必须包裹在 `data` 字段中。
3. 规划输出采用完整非流式响应、JSON 提取、字段校验和一次修复重试。
4. 规划成功后持久化 Generation；用户批准后使用编码模型生成源码并保存 Version，同时更新 Project 激活版本。
5. 分享采用可撤销令牌；所有者通过实体接口管理，分享页面只展示有效结果。
6. 每个长耗时动作必须显示明确阶段、失败原因和可重试入口，并在异常后复位加载状态。

