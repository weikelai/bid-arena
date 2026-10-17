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
