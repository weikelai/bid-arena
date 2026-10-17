# 最终验收矩阵

依据原始《全栈评测-拍卖间.md》逐项核对。原阶段1矩阵已保存在 Git 初始快照2503d71，原始审计未改。PASS只表示所列验证范围，不代表外部隐藏测试或本人能力已通过。

命令 C：docker compose config --quiet / build / up -d --wait / ps；T：npm run test:compose（包含前端5项、后端4项单元及真实MySQL集成、20人模拟、Edge浏览器）；S：node scripts/verify-secrets.mjs。原生历史结果见 docs/STAGE1_VALIDATION.md，以下为最新容器MySQL验收。

| 编号 | 需求/业务规则 | 模块/实现文件 | 自动化验证/命令 | 实际证据与状态 | 风险/依赖 |
|---|---|---|---|---|---|
| R01 | Vue3/TS/Vite可操作页面 | frontend/src/App.vue,package.json | T构建及浏览器 | PASS：登录/加入/出价/管理/钱包实际操作 | 依赖Node与Edge |
| R02 | Java17/Solon3.x | backend/pom.xml,Application.java | C构建、T | PASS：Solon3.10.7依赖树、Java17构建 | banner版本不代替依赖树 |
| R03 | MySQL8唯一事实源，无非必要基础设施 | Database.java,compose.yaml | T真实MySQL8.4、SQL核对 | PASS | 未做负载SLA |
| R04 | Compose自动迁移及种子 | DemoSeeder,V1–V3 | C、compose-verify.mjs | PASS：三迁移成功、三用户三初始流水，共3000 | 首次镜像需网络 |
| R05 | DRAFT→RUNNING→SETTLING→FINISHED及取消 | AuctionService.finish/start | AuctionIT及browser T | PASS：取消释放、终态不可取消、唯一结果 | SETTLING事务内短暂状态 |
| R06 | 100/10/180/1000，首价110 | schema,seeder,service | DatabaseIT/AuctionIT T | PASS | 短时拍卖仅显式配置 |
| R07 | 严格早于截止，相等拒绝 | durable intake/place | 相等PENDING及跨锁截止测试 T | PASS | 接收定义是取得接收门后数据库计时 |
| R08 | 差额冻结、余额非负 | wallets/holds/money | 同人差额、资金不足、SQL对账 T | PASS | BIGINT整数 |
| R09 | 新领先冻结、旧领先释放、失败无资金副作用 | place,money | AuctionIT及20人 T | PASS | 拒绝仍写私有事件 |
| R10 | requestId只生效一次、参数冲突 | bid_requests主键/指纹 | 六并发重复及HTTP409 T | PASS | 用户全局范围、ASCII1–64 |
| R11 | 并发同价唯一领先、跨场共享钱包 | 拍卖锁/有序钱包锁 | AuctionIT T | PASS | 有限死锁重试三次 |
| R12 | 失败事务完整回滚 | Database.transaction | 资金写后异常注入 T | PASS | 注入点不是每条SQL穷举 |
| R13 | 最后5秒+10，最多3次且上限后可出价 | place | 顺序与并发延时、HTTP狙击 T | PASS | 依赖MySQL UTC时钟 |
| R14 | 服务端自动结算、无人不扣款 | tick/finish | 空拍卖、HTTP自动结束 T | PASS | 扫描1秒、每批100 |
| R15 | 重复/并发结算唯一扣款/结果/流水 | result PK/effect unique | 四执行器并发及重复tick T | PASS | 同库多个对象，未双完整容器故障演练 |
| R16 | 结算进程停止后重启恢复 | finish持久事务 | 子进程halt73后SQL检查与新执行器 T | PASS | 未进行宿主机断电演练 |
| R17 | 钱包、流水、hold、成交一致 | wallet_transactions | 直接SQL核对所有测试钱包 T | PASS | 积分扣款非真实支付 |
| R18 | 用户/钱包/拍卖/参与者/出价/成交/Token最低模型 | migrations | DatabaseIT精确表集、约束 T | PASS：16应用表 | 无跨表CHECK，事务维护 |
| R19 | 所有必需HTTP能力及OpenAPI | Api.java,openapi.json | HTTP模拟T、17路径实际GET | PASS | 文档响应为通用结构部分 |
| R20 | 必需事件字段、单场递增seq | event,snapshot,events | HTTP字段/顺序 T | PASS | 连接状态/快照为水位而非新业务序号 |
| R21 | BID_REJECTED仅本人 | visibility/user_id过滤 | 两用户事件隐私断言 T | PASS | 私有seq造成他人缺口 |
| R22 | 通知失败不回滚、丢消息重新快照 | 持久事件轮询/room.ts | 浏览器offline/reconnect、核心交互T | PASS | 等价轮询，非WebSocket连接 |
| R23 | 登录、角色及私人钱包隔离 | Api.authenticate/human/admin | 真实HTTP模拟T | PASS | 生产登录限流未实现 |
| R24 | Agent独立凭据/范围/权限/到期/吊销/限流 | tokens/scopes/rate | HTTP授权、401/403/429 T | PASS | 固定分钟窗口非滑动窗口 |
| R25 | 摘要存储/仅签发一次返回/不提交凭据 | issue/UI/gitignore | SQL LENGTH(digest)、S | PASS | 实际录屏仍需人工检查 |
| R26 | 20人、seed42、并发/重复/资金不足/迟到/延时/重连/最终核对 | simulate-auction.mjs,HttpSimulationIT | T | PASS：摘要及SQL对账 | 默认仅隔离演示环境 |
| R27 | 至少一个Vue核心交互测试 | room.test.ts | T前端测试 | PASS：前端共5项 | 非全页面覆盖率 |
| R28 | .env.example、一键测试、管理员/两真人、DRAFT演示 | setup-env/README/compose | C、T重启对比 | PASS：DRAFT end_at NULL、余额不变 | 测试脚本默认3307/5173 |
| R29 | README完整可复制演示路径 | README,DEMO_RUNBOOK | 实际命令+浏览器T | PASS | 五分钟取决于首次下载 |
| R30 | DESIGN/DECISIONS/DEBUG_LOG/AGENT_TOOL_SPEC | 根目录文档 | 文件及对应代码核对 | PASS | 外部模型Agent接入未声称已做 |
| R31 | AI_USAGE含本人决策、分工、可独立解释范围 | AI_USAGE | 文档已记录Agent事实与待确认项 | NOT VERIFIED | 本人必须确认三项设计与独立讲解，不能代签 |
| R32 | 有意义的真实开发历史 | Git | git log/status | NOT VERIFIED：原目录无Git，本次仅真实快照与后续验收提交 | 不可重建不存在的逐步历史 |
| R33 | 3–5分钟录屏 | docs/DEMO_RUNBOOK | 自动化截图存在，完整录屏未交付 | BLOCKED | 本人录制并检查无Token |
| R34 | GitHub/Gitee仓库、姓名联系方式及邮件提交 | 外部交付 | 未发布、未发送 | BLOCKED | 缺仓库授权与本人资料，禁止自行外发 |
| R35 | 可访问线上地址（加分） | 外部部署 | 未部署 | BLOCKED | 需服务器/域名/凭据授权 |
| R36 | 现场无Agent讲解/临时变更核验 | 本人 | 未进行 | BLOCKED | 由本人及评审安排 |

所有本地PASS的详细结果和命令退出码见 FINAL_ACCEPTANCE_REPORT.md；原始需求未因外部阻塞删减。当前不宣称整个评测已经通过。
