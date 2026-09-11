# 复现步骤

前端：将本目录audit-*文件复制到app/frontend/tests，进入app/frontend执行 `pnpm exec playwright test tests/audit-temp.spec.ts`。三项中项目切换测试通过，停止和导出存档保护测试在当前实现失败。

后端：将test_audit_temp.py复制到app/backend/tests，使用已安装后端依赖的Python；配置SPARKFORGE_TEST_DATABASE_URL指向localhost上的隔离sparkforge_test数据库并设置PYTHONPATH=app/backend:app/backend/tests，从仓库根运行 `python -m pytest -q -s app/backend/tests/test_audit_temp.py --asyncio-mode=auto`。此测试重建隔离测试表，严禁指向业务数据库。

复现后移除复制到tests的临时文件。当前审查未改变业务实现。
