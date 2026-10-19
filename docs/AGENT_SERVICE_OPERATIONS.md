# 独立 Agent 服务维护说明

## 配置与权限

`node scripts/setup-agent.mjs` 只在已有、被 Git 忽略的 `.env` 追加缺失的 `AGENT_CONTROL_SECRET` 和 `AGENT_VAULT_KEY`，不重置已有配置或打印明文。前者为任务协调凭据，后者为 32 字节 AES 密钥（64 位十六进制）。Worker 不接受管理员密码或 MySQL 凭据；竞价仍使用每场受限 Token。

本机使用 `docker compose --profile agents up -d --build`。默认 profile 保留原三服务；启用 agents 后增加 Worker，后端重建以加载协调配置。后端的 `AGENT_WORKER_URL` 指向 Worker 私有地址；Worker 的 `AGENT_API_URL` 指向带 `/api/v1` 的后端地址。私网 HTTP 仅在显式 `AGENT_ALLOW_PRIVATE_HTTP=true` 时允许；远程模板不启用该选项。

管理员创建配置：`POST /api/v1/admin/agent-jobs`，字段 name、userId、auctionId、token、maxBidAmount，以及可选 maxBids（20）、pollMs（3000）、timeoutMs（5000）、maxErrors（10）。范围分别为 110..1e9、1..10000、3000..60000ms、1000..10000ms、1..100。默认策略为最低合法报价、领先时不加价、预算/次数耗尽后只监控到终态。

管理端 `GET /admin/agent-jobs`、`GET /admin/agent-jobs/{id}/history`、`POST /admin/agent-jobs/{id}/{start|pause|stop|revoke|configure}` 全部要求 ADMIN 真人会话。`configure` 只改预算/次数，且必须停机且无 pending。Worker 仅能调用 `/internal/agent-jobs/claim` 及指定任务的 prepare/recover/report，不能借协调凭据调用管理员、钱包或拍卖操作接口。

## 数据与恢复边界

V5 新增 agent_jobs、agent_job_events，不改旧迁移与资金事务。任务 Token 仅在签发时返回，创建任务时转交 Worker `/vault`；MySQL 只保存 token_id 及既有摘要。Worker 使用 AES-256-GCM、每文件随机 nonce、0600 文件和 0700 目录保存密文，密钥只在运行环境中。私有卷与密钥都须备份并限制访问，任何一项丢失都须吊销重建。创建任务时先入 vault 再写 SQL，SQL 失败可能留下孤立密文文件，不能把此项描述为跨系统原子事务。

领取任务使用 FOR UPDATE SKIP LOCKED、60 秒租约和递增 epoch；prepare/report/recover 拒绝过期或旧 epoch。请求 ID 为 `agent:<job UUID>:<逻辑次数>`；先持久化金额和 requestId，再发送受限竞价 API。Worker 崩溃接管复用同一请求；未知结果先查 receipt，已确认结果不会重复执行，未确认结果按同 ID 同金额恢复。

托管报价在 job 行锁下调用原 AuctionService（独立资金事务），与 stop/revoke/recover 同锁串行。stop 后尚未进入数据库的请求被隔离；已进入 durable intake 的 PENDING 必须等原事务重试或拍卖结算完成后确认，不能伪报未生效。Token 吊销且存在 intake PENDING 时依靠服务端到期结算确认，可能保持 STOPPING 到拍卖截止（上限原拍卖时长），不是立刻撤销已经接收的业务。错误上限不会丢弃 pending。

协调锁与资金事务跨两个连接，进程内最多三个并行托管提交，超出返回可重试 503，避免协调请求耗尽默认连接池。普通竞价路径和服务端金额校验保持不变。共享卷的多个 Worker 可接管相同任务；跨主机多 Worker 必须使用同一受控密文存储与密钥，本模板没有自动跨主机复制。建议先单 Worker；不要宣称跨主机分区容错已经验证。

state 是最近观测结果，desired 是管理员期望；进程中断不会凭空更新 SQL 的 state，应结合 last_decision、lease_until 和容器状态判断。`/health` 是进程循环存活检查，不保证后端 API 可用。每轮有界请求超时；429 退避 65 秒，网络指数退避至 120 秒；持续错误达到上限进入 ERROR，明确启动可重新尝试，FINISHED 不可重启。

## 独立服务器模板

`deploy/compose.agent.yaml` 仅包含 Worker，无数据库凭据或端口；128MiB 内存、0.5 CPU、只读根文件系统、非 root、禁提权、私有卷、健康检查和 unless-stopped 重启策略。后端入口需有效 HTTPS，网络防火墙仅允许 Worker 到该后端的 443、必要 DNS 和证书服务；入站 vault 仅允许后端经私有 TLS 通道访问。模板只映射 loopback 8090，须另建可信反向代理/隧道并配置后端 AGENT_WORKER_URL，不能省略此步骤或公开明文端口。

凭证轮换：先暂停/停止任务并等待所有 pending 确认；吊销旧 Token、创建新 Token 和任务。轮换协调凭据须同时更新后端与 Worker；轮换加密密钥前必须完成旧任务清退和旧 Token 吊销，保留受限备份再配置新密钥，不能直接使旧 vault 无法解密。日志只记录固定错误代码/决策，不记录请求头、响应正文、密码或 Token。

远程模板属于部署准备，不代表已公网部署。既有 MySQL 镜像漏洞门禁和域名/证书/服务器资源阻塞仍保留。

## 测试

先构建前端，再 `node scripts/test-isolated.mjs '-Dit.test=AgentServiceIT'`。使用容器 3307 的随机隔离 schema，启动真实 Java 后端、两个独立 Node Worker、故障代理和三个 Edge 会话；不会改宿主 MySQL 3306。日志位于被忽略的 backend/target/agent-*.log。完整相关回归见 AGENT_SERVICE_REPORT.md，不把历史测试冒充本轮运行。
