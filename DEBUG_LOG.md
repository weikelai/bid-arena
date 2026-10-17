# 真实问题记录

历史阶段 1 记录保留在 docs/STAGE1_VALIDATION.md。本文件只记录实际遇到的问题，不补造历史。

| 问题 | 证据与定位 | 修复 | 验证 |
|---|---|---|---|
| Docker daemon 管道不存在 | docker version 有 Client，但 dockerDesktopLinuxEngine pipe not found；当时 HTTP 8080/5173 不通 | 正常启动已安装 Docker Desktop；不重装、不重置 | docker info 成功，三个容器 healthy；compose-verify 重启对账通过 |
| 上一轮 API 草稿编译失败 | .local/backend-progress.log 有括号错误，Solon Context 包名与 bodyAs 方法不存在 | 修正 Solon API，随后拆分 Api/AuctionService/Sql | Maven 实际构建和单测通过 |
| DATETIME 映射类型错误 | 第一次 AuctionIT 7 项报 LocalDateTime cannot be cast to String | Sql.rows 同时将 Timestamp、LocalDateTime 转 UTC RFC3339 | 后续 13 项 MySQL 测试通过 |
| 模拟脚本启动路径错误 | http-simulation.log 显示 /auctions/2/start HTTP404，空响应导致 JSON 解析失败 | 使用 /admin/auctions/{id}/start；解析失败记录路径、状态，不打印凭据 | 后续 20 人模拟 55 项断言通过 |
| SQL 触发器故障注入权限不足 | MySQL 开启 binlog，临时账号创建 trigger 要求 SUPER | 不扩大权限、不改数据库全局参数；改为 package-private 故障注入器，在真实事务资金写入后抛 SQLException | 故障用例重新执行，最终结果见 FINAL_ACCEPTANCE_REPORT.md |
| PowerShell 管道损坏中文源码 | Python 从 PowerShell stdin 接收的 App.vue 中文变为问号 | 使用 apply_patch 写入 UTF-8 中文 | 前端重新构建；浏览器中文标签定位通过 |

原始运行日志在被忽略的 .local/ 和 backend/target/，包含当次真实输出；测试完成后可以重跑生成，不将日志当作永久运行保证。
