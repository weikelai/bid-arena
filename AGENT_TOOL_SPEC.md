# 竞拍 Agent 工具契约

只通过 HTTP API 操作。OpenAPI：GET /api/v1/openapi.json。MySQL、管理凭据、他人钱包不属于 Agent 工具。

管理员在浏览器创建 kind=AGENT 用户，初始积分 1000；为指定 auctionId 签发 Token，权限选择 auction:read、auction:bid，配置 expiresInSeconds 和 rateLimit（每分钟固定窗口）。Token 明文仅本次签发返回，界面可隐藏；不要录屏、写入仓库或命令参数。通过安全环境变量 AUCTION_AGENT_TOKEN 交给 Agent；数据库仅存 SHA-256 摘要。

请求头：Authorization: Bearer <环境变量中的 Token>。不要在工具日志中输出此请求头。

1. GET /api/v1/auctions/{id}：读取 status、current_price、min_increment、end_at、extension_count、seq、serverTime、result。
2. POST /api/v1/auctions/{id}/join，JSON `{}`：加入授权拍卖，要求 auction:bid。
3. POST /api/v1/auctions/{id}/bids，JSON `{"requestId":"唯一且稳定的请求编号","amount":110}`：整数积分。最低为当前最高价+10；资金不足或迟到返回 BID_REJECTED。HTTP 200 也必须检查 type/error，不可仅凭状态码确认成交。
4. 网络超时使用同一 requestId 和相同金额重试。响应 replayed=true 为幂等重放；改变参数 HTTP409 IDEMPOTENCY_CONFLICT。不要为了重试生成新编号。
5. GET /api/v1/auctions/{id}/events?after=<seq>：已提交的持久事件。每秒拉取会占用 Token 配额，默认 60/分钟；需要轮询和出价时管理员应提高额度，或适当降低读取频率。缺口或断线后重取快照。
6. 结束后读取 snapshot.result，不能客户端自行宣布赢家。401 表示无效/到期/吊销，403 表示范围或操作不足，429 表示固定分钟窗口额度耗尽。

管理员吊销：POST /api/v1/admin/agent-tokens/{id}/revoke。Agent 自身没有管理权限，也不能列举全部拍卖、读取钱包或以密码登录。Agent 的策略预算应由调用方保管，服务端钱包仍是最终余额约束。

自动化示例脚本 scripts/simulate-auction.mjs 在隔离测试库中签发临时 Token 并验证授权、过期、吊销、限流和真实竞价；不打印明文。外部 Agent 的实际接入与录屏由评审/本人安全传入凭据后执行，不伪称已连接外部模型。

## 2026-10-17 最终收尾最新状态（取代此前外部交付待办描述）

本轮实际重新执行 docker compose config --quiet、docker compose build、docker compose up -d --wait、node scripts/compose-verify.mjs --integration，全部退出0。完整回归结束20:16:12+08:00：后端单元4、真实MySQL集成18、前端5、20人模拟59项断言通过；Edge三上下文及SQL资金对账通过。新增独立auction-agent子进程真实出价110和取消后退出0，不再只是语法检查。历史57项是上一轮结果，予以保留。

种子重启快照一致：3用户、3条初始流水共3000、钱包各1000/0、演示DRAFT且end_at为空。测试仅使用容器3307随机隔离库，不修改本机3306。完整本地日志：.local/release-tests-final.log；构建及启动日志：.local/release-build.log、.local/release-up.log，均不发布。

状态分类：A PASS为上述本地核心、容器和自动化；GitHub发布以GITHUB_RELEASE_REPORT.md中实际推送和远端文件核验记录为准。B FAIL：最终回归无剩余失败，历史失败保留。C NOT VERIFIED：全过程开发历史、宿主机断电/大规模性能/双完整容器网络分区、可选线上部署。D BLOCKED仅用于实际外部阻塞，不把跳过人工环节视为阻塞。E OUT OF SCOPE：正式录屏、本人独立讲解/现场修改、评测方邮件/个人资料/外部提交，用户明确不要求本次交付，均未执行，不能宣称原始评测全部通过。

发布安全命令：node scripts/audit-release.mjs 与 node scripts/verify-secrets.mjs；扫描全部可达Git历史、跟踪文件及本地日志，不输出凭据值。真实.env、.local和日志截图不上传。HTTPS默认多账号凭据选择失败后选用现有weikelai GCM账号，dry-run通过；未要求提供Token或伪造历史。架构和已通过业务逻辑本轮未重构。

本节明确取代旧文档中“远端未授权”“独立Agent仅语法检查”“本人必须完成录屏/外部提交”的当前状态描述，旧文字保留作历史。AI完成本轮安全扫描、Agent脚本验收、自动化回归及发布整理，不代表本人独立设计能力已核验。仓库：https://github.com/weikelai/bid-arena 。