# Bid Arena UI/UX 重构报告

日期：2026-10-18。范围：前端展示、布局、交互分层及浏览器验收适配。本次没有修改后端、数据库迁移、接口契约、资金写入或结算逻辑；没有提交或推送到 GitHub。既有 MANUAL_DEMO_REPORT.md 保留，本次不冒充另一次人工四窗口演示。

## 布局与信息架构

桌面使用三栏控制台，1440×900 下左栏248px、右栏340px、中栏自适应。页面占据一个视口，长内容在局部滚动，不再将所有模块从上到下展开。

| 区域 | 内容 | 滚动与默认状态 |
|---|---|---|
| 左栏 | 品牌、身份/用户ID、退出、钱包可用/总额/冻结、拍卖列表、管理员入口 | 钱包固定；列表内部滚动；当前拍卖高亮 |
| 中栏 | 拍卖ID/标题/状态/seq/同步、价格、倒计时、领先者、延时、人数、操作、结果 | 核心信息集中；必要时详情内部滚动；底部参与者和最近4次出价 |
| 右栏 | 出价历史、资金流水、Agent、创建拍卖 | 默认仅历史；单个Tab内容内部滚动；普通用户不显示管理Tab |

管理员可从左下入口或右侧Tab打开创建/Agent，不需要翻到页面底部。Tab支持方向键、Home/End及可见焦点。非激活面板不渲染完整表单。未选择拍卖时展示空状态，Agent签发按钮禁用，防止没有授权目标的操作。

当前拍卖列表项使用已接受的权威快照更新价格和状态；其他拍卖项仍使用列表接口最近一次读取的状态，可手动刷新，未引入新的全局订阅或改变原同步协议。

## 组件结构

- `frontend/src/App.vue`：保留登录、会话代次、房间代次、seq/version防护及API调用；组织三栏和管理员表单插槽。
- `frontend/src/components/WalletSummary.vue`：精简资产和同步状态。
- `frontend/src/components/AuctionMainPanel.vue`：核心状态、操作、成交结果、参与者、最近出价；以事件调用父层已有方法。
- `frontend/src/components/RightInspector.vue`：角色可见性、Tabs、键盘焦点和局部滚动容器。
- `frontend/src/components/BidHistoryTable.vue`：序号、用户、金额和服务端时间；缺失时间显示“—”，不伪造。
- `frontend/src/components/LedgerTable.vue`：本人流水、余额/冻结变化、本场摘要与高亮；区分冻结、释放、成交扣款。
- `frontend/src/theme.css`：通用视觉和双栏登录样式。
- `frontend/src/console.css`：桌面控制台、内部滚动、状态和响应式布局。
- `frontend/browser-check.mjs`：原业务断言保留，添加Tab操作及布局/管理验证。

没有新增运行依赖或UI框架。本地此前查找未发现UI/design skill，没有虚构已调用此类skill。

## 视觉与状态

采用雾白背景、细网格、半透明面板、轻边框、小号辅助字、黑白矩形按钮和低饱和绿。价格、倒计时和成交价采用独立数字层级。主操作、次要操作、取消操作有视觉区别。

领先/被超过/已结束由原有服务端快照和成交结果推导，出价响应保留“不代表最终获胜”提示。FINISHED独立展示赢家和成交价；取消单独展示，避免误把CANCELLED的零价记录呈现为正常成交。最近出价为已接受记录，不虚构事件；延时次数与截止时间直接取权威快照。

钱包概览不再显示长说明；冻结与释放解释、本人最近200条流水、本场汇总放入流水Tab。汇总仅针对已加载流水，不宣称是无限历史统计。

## 实际执行与结果

浏览器操作由Playwright驱动真实Edge，不能等同用户本人已手工验收。所有下列最终命令退出0；原始日志位于被忽略的 `.local/ui-refresh/` 和 `backend/target/`。

| 命令/检查 | 本轮真实结果 | 证据 |
|---|---|---|
| `npm --prefix frontend test` | 2文件、7测试通过 | console-frontend-test.log |
| `npm --prefix frontend run build` | vue-tsc与Vite生产构建通过 | console-frontend-build.log |
| `node .local/ui-refresh/integration.cjs` | 临时受限账号包装 `mvn -B -f backend/pom.xml verify -Pmysql-it -Dit.test=HttpSimulationIT`，4单元、1真实MySQL集成通过；失败/错误/跳过0；15:06:42结束 | console-it-final.log |
| HTTP边界/20人模拟 | 49检查/65断言通过，含独立Agent真实API行为及资金SQL核对 | backend/target/http-boundaries.log、http-simulation.log |
| 隔离Edge业务回归 | 创建DRAFT、开始/取消、双用户加入/竞价/被超过、乱序响应/旧快照/跨会话隔离、断线恢复、自动SOLD、余额890/冻结0、最后5秒延时通过 | backend/target/browser-acceptance.log |
| 新布局与Tab验收 | 1440×900及1920×1080整体高度=视口；核心价格/出价按钮/Tab位于屏内；列表和右面板overflow=auto；键盘切换通过 | 同上 console-layout 行 |
| 管理UI真实交互 | 创建独立Agent、签发本场Token、隐藏明文、吊销通过；普通用户无管理Tab | 同上 PASS console tabs 行；未记录明文 |
| `docker compose build frontend` | 最终前端镜像构建通过 | console-build-final.log |
| `docker compose up -d --no-deps --wait frontend` | 只更新前端，健康检查通过 | console-up-final.log |
| `node .local/ui-refresh/console-check.cjs` | 本机实际页面登录/退出、已有第10场成交190、历史/流水/Agent/创建切换、零页面异常；只读查看既有拍卖，不进行新扣款 | console-browser-final.log |
| `node scripts/verify-secrets.mjs`、`node scripts/audit-release.mjs` | 已有扫描通过；历史仍12提交/154 blobs，扫描不证明绝对安全 | console-security.log |
| `git diff --check` | 通过 | 实际终端输出 |

真实MySQL测试在Compose 3307下随机 `bid_arena_it_*` 数据库执行，结束清理仅本轮隔离资源。没有修改本机3306，也没有重置原演示账号或账务。没有将历史36项集成、四档压力或死锁测试的结果当成本次重新执行：本轮针对展示层运行上述定向真实集成和浏览器回归。

部署后真实DOM测量：

| 分辨率 | 页面宽/高 | 列表/详情/右栏滚动 |
|---|---|---|
| 1440×900 | 1440 / 900 | 各自auto |
| 1920×1080 | 1920 / 1080 | 各自auto |
| 1280×720 | 1280 / 720 | 各自auto；中部可能需要局部滚动 |

另检查390px宽页面没有横向溢出；窄屏改为顺序布局并允许页面滚动，不套用桌面固定视口约束。

截图已实际生成并查看：console-1440.png、console-1280.png、console-agent.png、console-ledger.png、console-mobile.png，位于 `.local/ui-refresh/`；含本人演示数据，保持本地忽略，不发布截图。

## 失败及修复记录

1. 首轮定向集成退出1：新增PTS单位进入原价格元素，原精确断言期望110而获得110PTS。移除该元素内单位，保持价格断言不变。证据console-it-attempt1.log、console-browser-attempt1.log。
2. 第二轮退出1：取消时重复显示取消结果卡与取消提示，`.room .notice`有两个匹配。UI合并取消展示，保留实际成交/无人出价结果卡与原断言。证据console-it-attempt2.log、console-browser-attempt2.log。
3. 修复后定向完整链路退出0，所有原业务断言及新增UI断言通过，没有删测试或降低资金要求。

## 当前访问与局限

访问 http://127.0.0.1:5173 ，Ctrl+F5刷新。选左侧拍卖后，中间观察状态；右侧切换历史/流水；管理员从左下或右侧进入管理。之前保留的浏览器窗口尚未刷新时仍可能是旧JS页面，需要刷新，不代表容器未更新。

已完成本轮桌面信息架构目标。尚未穷举极长文本、200%缩放、所有屏幕阅读器和浏览器；低高度视口可能需要中栏局部滚动。移动端仅基础适配，未作全面触屏体验验收。

没有新增匿名公开观察路由；此前第四窗口辅助只读页不属于本轮页面重构，它的旧样式不自动随产品前端更新。不将当前登录工作台称作匿名观察功能。

后续可按使用偏好微调三栏宽度、辅助字字号，或另行添加列表搜索和流水筛选。它们不是本轮已实现功能。代码与本报告保留为本地未提交修改，发布需另外执行审查和授权流程，未改变既有GitHub冻结版本。
# 第二轮字体与可读性精修（2026-10-18）

本节补充并优先于下方第一轮记录；保留原有历史。本轮没有后端、迁移或资金业务修改，没有 Git 提交或推送。

## 实际修改

- `frontend/src/typography.css`：新增共享字号、文字颜色、行高、字重变量和语义样式。
- `frontend/src/console.css`：现有字号和文字颜色改为引用统一变量；三栏及局部滚动结构保持。
- `frontend/src/App.vue`：在现有样式后载入字体规范。
- `frontend/src/components/LedgerTable.vue`：中文类型及英文标识、总余额/冻结变化分列、金额右对齐；长 requestId 使用可展开详情并换行。
- `frontend/browser-check.mjs`：追加两种桌面尺寸、四种状态的布局及实际渲染文字对比度检查，保留原有业务断言。

字号规范：页面标题 28px、面板标题 18px、当前价 48px、钱包 36px、倒计时/终态 36px、正文/表格 14px、辅助/表头 12px、纯装饰英文 11px。正文行高 1.65，紧凑标签 1.4；数字使用等宽数字特性。主文字 #27323d，次级 #53616f，成功 #315f49，警告 #865039，信息 #365b7c，禁用 #5d6670。关键 ID、金额、时间没有使用装饰字号。

## 对比度与实际浏览器

Playwright 调用本机 Edge 的真实浏览器引擎（headless），检查管理员与普通用户、DRAFT/RUNNING/FINISHED/CANCELLED、历史/流水/Agent/创建表单、断线恢复和异步响应隔离。1440×900、1920×1080 的根页面尺寸均不超过视口；列表、中央详情和检查器保留独立滚动。另检查 1280×720 和 390px 基础响应式。

实际 DOM 样式计算包含前景透明度及祖先背景合成；被检查的关键标签、表格和状态最低对比度 5.40:1。该算法不直接采样渐变像素，因此另外将六种文字色与 #e9edf2、#eef1f4、#edf3ef、#e5e9ed 四种保守浅背景组合计算，最低 4.78:1。不是对所有像素、所有组件状态的完整 WCAG 认证。

真实用户已有流水只读检查：中文/英文类型、展开请求详情、各金额单元格 scrollWidth≤clientWidth、右栏可实际滚动、两个桌面尺寸及零 pageerror。截图已生成并人工查看，包括 `type-FINISHED-human-1440.png`、`type-ledger-human-1440.png`、`type-populated-ledger-1920.png`。证据保存在忽略的 `.local/ui-refresh/`，不上传个人数据截图。

## 命令与证据

| 实际命令 | 结果 | 日志（相对仓库根） |
|---|---|---|
| `npm --prefix frontend test` | 退出 0，2 文件/7 测试通过 | `.local/ui-refresh/type-unit.log` |
| 在 frontend 执行 `node_modules/.bin/vue-tsc.cmd --noEmit` | 退出 0 | `.local/ui-refresh/type-tsc.log` |
| `npm --prefix frontend run build` | 退出 0，类型检查及 Vite 构建通过 | `.local/ui-refresh/type-build-native.log` |
| `node .local/ui-refresh/integration.cjs` | 退出 0，BUILD SUCCESS；2026-10-18 15:42:24 完成，耗时 1:45 | `.local/ui-refresh/type-final-it.log` |
| 实际内部命令 `mvn -B -f backend/pom.xml verify -Pmysql-it -Dit.test=HttpSimulationIT` | 4 单元测试；1 集成测试包含 HTTP 49 检查、20 人模拟 65 断言及浏览器流程 | `backend/target/{http-boundaries,http-simulation,browser-acceptance}.log` |
| `docker compose build frontend` | 退出 0 | `.local/ui-refresh/type-docker-build.log` |
| `docker compose up -d --no-deps --wait frontend` | 退出 0，前端 healthy | `.local/ui-refresh/type-docker-up.log` |
| `node .local/ui-refresh/console-check.cjs` | 退出 0，管理员表单/响应式/登录退出，无 pageerror | `.local/ui-refresh/type-console.log` |
| `node .local/ui-refresh/type-ledger.cjs` | 退出 0，真实已有流水、详情展开、滚动与金额边界通过 | `.local/ui-refresh/type-ledger.log`、`type-ledger-results.json` |
| 本地配色计算 | 退出 0，最小 4.78:1 | `.local/ui-refresh/type-palette.json` |
| `git diff --check` | 退出 0，仅 Git 换行提示 | 终端输出 |

测试账户仅授权 Compose 3307 上随机 `bid_arena_it_*` 测试库，测试结束清理自身资源；正常页面检查只读已有数据。3306 仍由原进程 8864 监听。没有重置数据库或卷。

## 真实失败与局限

首轮新增检查实际失败：取消标签对比度 4.42:1，发现新字体文件未被页面载入；修复引用及状态颜色后回归。另一次重跑尝试遇到日志被前一进程占用，未把 shell 返回值冒充测试通过；最终使用独立 `type-final-it.log` 串行复测。保守配色扫描还发现禁用文字原为 4.44:1，已加深并重新构建。

本轮没有附带的新用户截图可读取，以真实浏览器当前页面截图核验。尝试打开可见默认浏览器被执行环境策略拒绝；真实 Edge 自动化及截图检查已执行，不声称用户已完成手工验收。访问 http://127.0.0.1:5173 后 Ctrl+F5 查看。未覆盖全部浏览器、屏幕阅读器、200% 缩放及极端金额；低高度中央区域允许局部滚动，终态的辅助反馈可能需滚动查看，核心价格、状态、成交及按钮可见。禁止通过缩小正文来塞内容。

---
