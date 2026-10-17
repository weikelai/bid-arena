# Bid Arena 逐项验收矩阵

依据：已完整阅读《全栈评测-拍卖间.md》。原矩阵保留完整目标；阶段1后根build/test:unit/test:integration/test:all已实现，不支持--suite。表中旧的suite命令及simulate/E2E仍为未来接口，不能声称已执行；最新实际状态见下表与docs/STAGE1_VALIDATION.md。

## 阶段1实际状态覆盖表（2026-10-17）

| 需求编号 | 当前实际状态 | 已执行验证 / 剩余事项 |
|---|---|---|
| R01 | 部分完成 | Vue/TS/Vite构建、最小健康反馈及3测试通过；完整拍卖UI待实现 |
| R02 | 部分完成 | Java17/Solon3.10.7实际JAR启动、HTTP健康与构建通过；WS/业务接口待实现 |
| R03 | 基础完成、容器待验 | 真实MySQL8.4空库迁移与重复执行通过；Docker缺失阻塞Compose |
| R05 | 种子默认值通过 | 钱包1000、起价100、加价10、180秒已验证；出价校验待实现 |
| R18 | 仅模型及哈希完成 | 演示密码真实哈希校验通过；登录、停用与权限待实现 |
| R19 | 基础模型完成 | 14表、外键/CHECK、requestId/流水/结果唯一性及事务回滚真实测试通过；业务不变量待实现 |
| R26 | 部分完成 | 4后端单测+6真实MySQL集成+3前端测试通过；资金并发/结算/核心Vue交互待实现 |
| R27 | 部分完成、网络阻塞 | env随机生成、健康检查与自动迁移/种子已实现；`docker compose config --quiet`通过、3306无映射冲突；Docker daemon可用但基础镜像授权请求超时，build/up/容器健康未验证 |
| R28 | 种子通过、登录待实现 | 并发种子/重复进程启动不重发积分，DRAFT且无截止时间；API登录未实现 |
| R29 | 阶段1路径完成 | README包含构建、启动、测试及环境阻塞；完整业务演示链待后续 |
| R30 | 部分完成 | DESIGN.md与真实阶段验证记录已提供；完整AI_USAGE/DECISIONS等待后续 |
| R31 | 未完成 | Git可执行但目录不是仓库；未创建提交或录屏 |
| R33 | 已落实阶段1 | 单体+MySQL，无Redis/额外基础设施 |

其他行仍未实现。下方为保留的完整目标基线，其原始“当前状态”由本节实际覆盖表更新；避免将阶段1部分完成误当完整业务验收。

命令约定：T=`npm run test:all`；I=`npm run test:integration -- --suite=<名称>`（真实 MySQL 8）；U=`npm run test:unit -- --suite=<名称>`；F=`npm --prefix frontend run test -- --run`；S=`npm run simulate:auction -- --auctionId=<ID> --bots=20 --seed=42`；C=`docker compose up -d --build --wait`；V=`npm run verify:delivery`。根 npm 脚本仅负责编排 Maven / 前端 / 黑盒脚本，不能用空实现返回成功。

| 编号 | 业务规则 / 验收点 | 涉及模块 | 实现方案 | 自动化验证方法 | 验收命令 | 当前状态 | 风险与依赖 |
|---|---|---|---|---|---|---|---|
| R01 | Vue 3 + TS + Vite，可操作界面 | frontend | 登录、列表、房间、钱包、管理操作 | 构建、核心 Store 测试、双浏览器 E2E | F；`npm run test:e2e` | 未实现 | Node engines、浏览器环境 |
| R02 | Java 17 + Solon 3.x HTTP/WS | backend | 单体分层、异常映射、独立鉴权 | 版本检查、启动与 HTTP/WS 冒烟 | V；I(boot) | 未实现 | 事务与 WS 插件兼容 |
| R03 | MySQL 8 唯一事实来源 | persistence | InnoDB、版本化迁移、自动种子 | 空库启动、重启迁移、数据持久化 | I(migrations)；C | 未实现 | Docker / 服务端未核实 |
| R04 | 状态机与 SETTLING 后禁取消 | auction | 锁行后条件转换 | 全转换表、取消/结算并发 | U(state)；I(lifecycle) | 未实现 | 锁顺序统一 |
| R05 | 100 起价、10 加价、180 秒、1000 初余额 | seed / auction | 默认配置；无出价当前价=100 | 第一口100拒绝、110接受；种子断言 | I(defaults) | 未实现 | 不可误判首口100合法 |
| R06 | 仅 RUNNING 接受出价 | bidding | 锁内状态校验 | DRAFT/SETTLING/FINISHED/CANCELLED | I(bid-validation) | 未实现 | 到期仍 RUNNING 也拒绝 |
| R07 | 接收时间严格早于截止 | bidding / clock | 记录服务端接收时刻，锁内重读截止 | 截止前1微秒、相等、后1微秒与锁等待 | I(deadline)；U(clock) | 未实现 | 时间来源与结算竞争须验证 |
| R08 | 可用=总额-冻结，新增冻结=出价-本场冻结 | wallet | 持仓与钱包双层模型，条件更新 | 跨拍卖资金竞争、余额恰好足够 | I(wallet) | 未实现 | 不能只看总余额 |
| R09 | 换领先者释放，同人只冻差额 | wallet / bidding | 同事务释放旧持仓、冻结新持仓 | A110→A120→B130，逐步核对流水 | I(freeze) | 未实现 | 钱包全局锁顺序 |
| R10 | 失败零资金变化，非负且流水可解释 | ledger | 事务回滚、CHECK、余额条件、增量流水 | 失败前后表对比、注入中途异常 | I(rollback) | 未实现 | 禁止吞异常导致提交 |
| R11 | requestId 只生效一次并可识别 | idempotency | 用户+requestId 唯一、请求指纹、原响应持久化 | 并发重试、超时重试、异参冲突 | I(idempotency) | 未实现 | 拒绝结果同样明确处理 |
| R12 | 最后5秒基于最新截止+10秒，最多3次 | bidding | 与资金/出价同事务更新次数和截止 | 5秒、5秒外、相等截止、第四次合法不延长 | I(extension) | 未实现 | 不得用接收时刻+10秒 |
| R13 | 自动结算，不依赖请求；无人不扣款 | scheduler | 到期扫描、锁行、唯一结果 | 无客户端等待结算、空拍、钱包对账 | I(settlement) | 未实现 | 定时任务真实执行 |
| R14 | 重启、多实例、重复结算不重复扣款 | settlement | 状态条件+拍卖行锁+唯一结果/流水 | 双实例、进程杀停恢复、重复调用 | I(recovery) | 未实现 | 真进程与真实 MySQL |
| R15 | 取消释放冻结且仅一条结果 | cancellation | DRAFT/RUNNING 锁内取消及结清 | 取消重试、取消/出价/结算竞争 | I(cancel) | 未实现 | 评测测试段包含取消唯一结果 |
| R16 | 广播失败不回滚，快照权威 | realtime | 事务事件表、提交后发布、快照含seq | 发布故障、重连、提交后崩溃 | I(events) | 未实现 | 重复投递、迟到消息 |
| R17 | 所有确认事件含 auctionId/seq/serverTime/type | realtime / API | 单场持久序号、快照水位 | 顺序、重复、缺口、私有拒绝、重连断言 | I(events)；F | 未实现 | 私有事件导致合法缺口 |
| R18 | 用户身份/角色/哈希/状态及参与者 | auth / participant | 密码哈希、真人/Agent标识、唯一加入 | 登录、停用、重复加入、角色越权 | I(auth) | 未实现 | 不暴露他人钱包 |
| R19 | 最低数据事实完整、索引/约束 | persistence | 用户/钱包/流水/拍卖/参与/出价/结果/Token | schema 检查、重复插入、EXPLAIN | I(schema) | 未实现 | MySQL CHECK 与事务生效 |
| R20 | 全部指定 API 与 OpenAPI | API | 12项指定操作及流水查询扩展 | 契约测试、401/403/409等、规范校验 | I(contract)；V | 未实现 | 错误码与分页文档 |
| R21 | Agent 独立Token、限定拍卖/操作 | agent-auth | 随机令牌摘要、范围权限、状态校验 | 跨拍卖/管理接口/私有信息越权 | I(agent-auth) | 未实现 | 不能复用普通登录Token |
| R22 | Token 过期/吊销/可配置限流 | agent-auth | 每请求查库，持久窗口计数 | 到期等值、即时吊销、多实例限流 | I(agent-limit) | 未实现 | 窗口突发、锁顺序 |
| R23 | 明文只签发一次且无泄漏 | security | Bearer遮蔽、响应不缓存、DB只存摘要 | 日志/产物扫描、签发后不可取回 | I(token-secrecy)；V | 未实现 | 代理日志、录像、错误响应 |
| R24 | Agent 使用规范与示例 | docs / script | AGENT_TOOL_SPEC.md，环境变量取Token | 示例契约执行与泄漏检查 | V；I(agent-contract) | 未实现 | 文档不能放真实Token |
| R25 | 20人加入、递增/并发/重试/非法/延时/重连/结果 | simulator | 可复现seed、多身份、断言及摘要 | 整场黑盒；赢家/价/余额/冻结/唯一记录 | S | 未实现 | 账户与凭据准备、随机时序 |
| R26 | 单测+真实MySQL集成+并发+Vue测试 | tests | JUnit、MySQL容器、Vitest、E2E | 关键用例强制连接MySQL，不可静默跳过 | T；I(concurrency)；F | 未实现 | 基础设施缺失应失败退出 |
| R27 | 五分钟启动、env/Compose/迁移/种子 | delivery | 健康检查、自动迁移、幂等初始化 | 空卷启动计时、重复启动数据不重置 | C；V；I(seed) | 未实现 | 镜像拉取时间需实测记录 |
| R28 | 演示账号与待开始拍品 | seed | 题定三账号、DRAFT拍品、额外脚本账号 | 登录、余额1000、未自动倒计时 | I(seed) | 未实现 | 不在重启时覆盖密码/钱包 |
| R29 | README 完整可复制演示链 | docs | env→启动→开始→真人→脚本→Agent→结果→测试 | 在干净环境按文档执行 | V；S；T | 未实现 | 各平台命令差异 |
| R30 | AI_USAGE / DESIGN / DECISIONS / DEBUG_LOG | docs | 如实记录分工、3决定、2弃案、2真实问题、理解边界 | 结构检查+人工对照真实证据 | V；人工核验 | 未实现 | 不得编造比例/错误/模型 |
| R31 | 有意义历史、3~5分钟无泄漏录屏 | delivery | 阶段真实提交、录屏演示完整闭环 | 历史审查、录屏内容与时间检查 | 人工核验；V | 未实现 | Git路径、隐私与Token遮挡 |
| R32 | 现场解释与临时修改能力 | maintainer | SQL/事务讲解、日志定位、变更演练 | 20分钟无Agent讲解+30~45分钟改动 | 人工演练，改动后T | 未验证 | 文档不替代本人理解 |
| R33 | 简单架构，不引入必要性不足组件 | architecture | 单体+MySQL+WS，不用Redis | Compose与依赖审查 | V；人工审查 | 仅有草案 | 不扩大范围 |
| R34 | 交付窗口/提交材料/可选线上地址 | delivery | 记录收到题目时间，仓库+视频；线上可选 | 清单核验 | 人工核验 | 未完成 | 8~12小时建议、3自然日；收到时间未知 |

I(name)、U(name) 为上述命令模板的缩写，不是可直接执行的 shell 语法。命令实际落地时需验证参数确实筛选到目标测试，测试数量为零必须失败。最终提交邮箱等外部发送不在本阶段授权范围。

## API 能力清单（R20）

`POST /api/v1/auth/login`；`GET /api/v1/users/me`；`GET /api/v1/wallets/me`；`POST /api/v1/admin/auctions`；`POST /api/v1/admin/auctions/{id}/start`；`POST /api/v1/admin/auctions/{id}/cancel`；`POST /api/v1/admin/agent-tokens`；`GET /api/v1/auctions`；`GET /api/v1/auctions/{id}`；`POST /api/v1/auctions/{id}/join`；`POST /api/v1/auctions/{id}/bids`；`GET /api/v1/auctions/{id}/bids`。共12项指定操作。为支持资金核验，建议新增 `GET /api/v1/wallets/me/entries`；另补结果读取、Token吊销和拍卖事件订阅的明确契约。
