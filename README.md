# SparkForge

SparkForge 的当前代码位于 `app/`，采用 React + Vite + FastAPI / Atoms Cloud。
旧 Next.js / Supabase 原型及其压缩包已从本工作目录移除。

- `app/frontend/`：首页、工作区、应用预览、设置和分享。
- `app/backend/`：认证、实体数据、分享接口和业务校验。
- `docs/PROJECT_NOTES.md`：实现思路、关键取舍、完成程度和后续优先级。
- `docs/e2e/`：线上验收证据与当前卡点。
- `.atoms/`：平台迁移记录与产品约束。
- `docs/reviews/`：本地审查结果、修复范围及验证边界。

## 前端

```sh
cd app/frontend
pnpm install --frozen-lockfile
pnpm run dev --host 127.0.0.1
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:review
```

`typecheck` 显式检查 `tsconfig.app.json`。根 `tsconfig.json` 的 `files` 为空，单独执行 `tsc --noEmit` 不会完成应用源码类型检查。
`test:review` 自动启动本地 Vite，使用隔离的 UI 测试数据；不代表真实云端验收。

## 后端回归

在 Python 虚拟环境中安装 `app/backend/requirements.txt` 后运行：

```sh
cd app/backend
PYTHONPATH=. python -m pytest -q tests/test_entity_access.py tests/test_aihub_access.py tests/test_aihub_parameters.py --asyncio-mode=auto
```

当前测试使用隔离 SQLite 验证访问控制与字段校验，不覆盖 PostgreSQL 锁、真实认证或 Atoms Cloud 部署。

## 当前状态与部署边界

请先阅读 [实现说明](docs/PROJECT_NOTES.md) 和 [验收结论](docs/e2e/2026-09-06-verification-summary.md)。线上完整生成仍受代理超时阻塞，不应视为全链路验收通过。

真实登录、模型和云端数据依赖 Atoms 环境配置；本地测试使用隔离依赖。密钥、日志、构建产物及测试临时文件不入库。GitHub 推送不会证明 Atoms 已构建或发布；平台发布后须再次检查线上资源和业务链路。
