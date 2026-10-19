# 独立自动竞拍 Agent 服务交付报告

日期：2026-10-18；本轮在原有项目上增量实现，不重建项目。起始提交 `7edbbe46deb9525e6bc915bc96faef6008082576`。提交与独立克隆核验见 GITHUB_RELEASE_REPORT.md。

## 实现与边界

新增独立 Node Worker、Dockerfile、可选 Compose agents 服务、管理员任务 API/面板和 V5 迁移。保留浅色三栏及右侧独立滚动，既有 AuctionService、钱包、延时、结算事务未修改。旧手动脚本保留为兼容示例，README 已改为真实服务操作教程。

MySQL 新增 agent_jobs（配置、期望/观测状态、租约、待确认请求）及追加式 agent_job_events。任务使用最低合法报价策略，DRAFT 等待；RUNNING 自动加入，自己领先不加价，被超过且预算/次数足够才出价；预算或次数耗尽只监控；FINISHED/CANCELLED 读取权威结果后结束。界面支持配置/启动/暂停/停止、停机改预算和次数、决策历史、吊销及结果查看；高级配置包含轮询、超时和连续错误上限。

Worker 无管理员会话、数据库凭据或直接数据库连接。业务请求使用每场受限 Token；专用协调凭据仅用于 claim/prepare/recover/report。管理员创建任务需校验 Agent 身份及 read/bid 授权，先把 Token 交给私有 Worker vault，再保存任务。MySQL 不保存明文；私有卷以 AES-256-GCM 保存密文，密钥运行时注入，明文不在镜像、普通列表或日志中。跨系统创建失败可能留下孤立密文文件，未声称 vault 与 SQL 原子提交。

60 秒数据库租约、epoch 与 SKIP LOCKED 保证领取互斥；先持久化 `agent:<任务UUID>:<次数>` 和金额，再调用原受限出价 API。托管提交、停止/吊销、恢复使用同一 job 行锁；已完成请求返回可识别 replay，改金额拒绝。旧 Worker 的 prepare/report 被 epoch 隔离。进程内最多三个并行托管提交，避免双连接协调耗尽默认连接池。未知结果复用同 ID/金额，不生成新业务请求。

429 退避 65 秒，网络指数退避上限 120 秒，持续错误上限可配置；pending 不会因错误上限直接丢弃。停止先阻止新报价，再等待已接收请求确定。已进入 durable intake 的 PENDING 必须完成原事务或等待到期结算；Token 已失效时可能保持 STOPPING 至服务端结算，不能把撤销凭证误述为撤销已接收报价。

## 本轮实际验证

以下均为本轮运行；命令退出码和日志摘要见 TEST_EXECUTION_REPORT.md，散列清单见 docs/AGENT_SERVICE_VALIDATION_20261018.json。日志本地保留，不上传 Git。

| 项目 | 结果 |
|---|---|
| 前端测试 | PASS：7/7，退出 0 |
| vue-tsc 与 Vite 生产构建 | PASS，退出 0 |
| 后端构建/单元 | PASS：4/4，退出 0 |
| 9 类相关真实 MySQL 集成回归 | PASS：43，失败/错误/跳过均 0，退出 0；未重跑 StressIT/StabilityIT |
| HTTP 边界 | PASS：49 项，包含于 HttpSimulationIT |
| 20 人模拟 | PASS：65 项断言，seed=42；包含最终 SQL 对账 |
| 原有 Edge 多会话/异步恢复 | PASS：赢家、钱包、离线恢复和旧响应隔离；无页面异常 |
| 独立 Worker 测试 | PASS：1 项真实 MySQL IT，内部 19 组业务检查及 SQL 对账；最终版本复测记录见测试报告 |
| 新增浏览器流程 | PASS：真实 Edge 管理员及两个真人会话与独立 Worker 同场，任务创建/启动/暂停/决策历史/取消，Token 自动隐藏 |
| Compose | PASS：配置、三镜像构建、四服务 healthy、代理、V5 迁移；Worker stop/start/restart 后不自抬、不重复报价 |
| 重启/资金对账 | PASS：种子事实不变；wallet/ledger/hold 差异 0、重复流水/成交 0、pending 0、摘要长度异常 0 |
| 依赖与凭据扫描 | PASS：OSV 扫描 Maven 41 依赖无命中、npm audit 0；已知运行密钥及全历史/交付文件扫描无命中。扫描不能证明绝对安全 |

19 组 Worker 检查覆盖：DRAFT 不启拍；RUNNING 自动加入；预算内出价；双 Worker 不自抬；被超过再决策；暂停；预算耗尽；停机改策略/次数上限；同 ID replay 和异金额拒绝；取消结束；管理员/钱包/跨拍卖越权拒绝；吊销；到期；429；提交后响应丢失及后端/双 Worker 重启；FINISHED 结果；真实 HTTP 超时恢复；旧 epoch 与停止隔离；三会话浏览器；密文及日志脱敏。部分项目在同一组联合验证，不把组数当作 JUnit 测试数量。

初轮失败记录保留于 `.local/agent-check-failure1..5.log`：新路由路径参数读取、MySQL LEADING 保留字别名、序列化省略 null 的测试假设、浏览器 Agent 标签定位等问题已修复并复测。没有删除断言或跳过失败用例。后续增加真实超时和 replay 明确标志后执行针对性完整 AgentServiceIT，原核心回归不冒充每次小改都重新执行过。

## 本机状态与残留数据

四服务：mysql 127.0.0.1:3307→3306、backend 127.0.0.1:8080、frontend 127.0.0.1:5173；Worker 8090 仅容器网络、无宿主端口。默认三个服务仍可按原 profile 使用。Worker 128MiB/0.5CPU、非 root、只读根目录、禁提权、健康检查、自动重启、日志轮转。

Compose 验收仅新增专用演示 Agent 用户 #24、拍卖 #11、任务 d235f4c1-6a28-4244-9351-27d2d6bc727f；出价一次 110 后取消，冻结释放，凭证吊销；数据保留供审计，不删除。隔离测试使用容器 3307 随机 schema，完成后仅清理自建测试库/账号；宿主 MySQL 3306 未停止或修改。未执行 down -v、prune 或数据库重置。

## 未验证和阻塞

- NOT VERIFIED：独立远程服务器、真实公网 HTTPS/防火墙、跨主机密文共享与网络分区、长时间 Worker 稳定性/大规模任务量、Worker 容器完整漏洞扫描。双 Worker 证据限同机共享私有目录，不夸大为跨机容灾。
- NOT VERIFIED：Token 已吊销且仍存在 durable intake PENDING 的完整端到端故障组合；代码保留待确认并等待服务端结算，不伪报立即完成。任务/决策历史未加入自动归档，管理员列表仅最近 100 项、历史仅最近 100 条，长期部署需评估保留策略。
- FAIL（既有门禁，未重跑或声称修复）：生产 MySQL 镜像严重/高危漏洞记录仍有效，不能公开上线。
- BLOCKED：实际公网部署缺少服务器、域名、证书及安全镜像。远程 Compose 仅部署准备模板，不代表已上线。
- OUT OF SCOPE：正式录屏、本人现场讲解/修改及评测方外部提交，未执行。

部署、凭据轮换、租约及停止边界详见 docs/AGENT_SERVICE_OPERATIONS.md。后续应先完成生产安全门禁和受控环境部署验证，不再无必要重构资金核心。
