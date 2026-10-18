# 最终上线前审计（2026-10-18）

最终回归于16:42:07+08:00结束，退出0：4单元、36真实MySQL集成、7前端，失败/错误/跳过0；HTTP49、模拟65断言、Edge浏览器、四档短时压力及20/50有界持续通过，SQL对账无差异。三容器healthy，部署检查24项通过。证据生成时遇到PowerShell UTF-16日志解码问题，修正本地生成器后生成脱敏证据，原始日志未修改。

## 两个独立结论

**全栈评测交付：以本轮最终回归证据及逐项矩阵为准，不宣称原始全部评分维度已通过。** 核心技术/业务/自动化可复核；正式录屏、本人现场讲解/临时修改、评测方外部提交为OUT OF SCOPE且未执行。本人独立能力、早期全过程开发历史、隐藏脚本结果及可选线上部署NOT VERIFIED。

**公开生产部署：FAIL，不可直接公开上线。** 缺TLS、生产管理员引导、登录防暴力破解、服务端退出吊销、完整生产备份恢复/告警及最小权限分离等。当前只允许loopback评测/受控测试；详见SECURITY_AUDIT_REPORT，不以本地测试替代上线安全评估。

## 起始安全基线

- 起始本地master与远端master：f2b97dae3ed16a97aa70de1771829989adcabc76，实际ls-remote成功；保留12个真实提交，不重写历史。
- 工作区原有UI修改及MANUAL_DEMO_REPORT/UI_REFACTOR_REPORT未提交，保留并审查，不覆盖用户工作。
- Windows11、Java17.0.17、Maven3.8.8、Node22.15.1、npm11.14.0、Engine29.8.0、Compose5.5.1。
- 三容器起始healthy；loopback3307/8080/5173；宿主原MySQL3306 PID8864。未连接或修改3306数据。
- 原题Markdown及PDF五页完整读取；只在忽略目录安装pypdf以只读提取，未改原文件。

## 实际审查及修复

1. 读取全部后端业务/鉴权/数据库类、三份迁移、Vue状态及组件、测试、Docker/Compose/nginx，原题要求与测试映射见FUNCTIONAL_AUDIT_REPORT及需求矩阵。
2. Jackson2.19.1实际OSV匹配15公告；核查范围后BOM统一2.21.7，41运行时依赖重扫无命中。不宣称15项均可利用。
3. nginx增加CSP、DENY、nosniff、referrer/权限策略并隐藏版本；部署后24项检查与实际Edge静态加载通过。
4. browser-check递归创建截图父目录，保证新克隆不依赖已有.local；保留全部业务断言。
5. 安全扫描扩展未跟踪待发布文件及嵌套文本证据；新增可复现OSV/部署检查脚本。
6. README重整为完整PowerShell教程，原全文保存docs/README_HISTORY_PRE_RELEASE.md，保留所有历史失败。
7. 持续档Windows资源采样子进程5秒超时导致一次真实失败；预算改为15秒并增加NonInteractive/ErrorAction Stop，8次真实探针通过。没有跳过采样或放宽HTTP/资金/资源上限断言，完整复测结果见最终证据。

## 清理清单与保留理由

- 删除代码：App.vue中ledgerName、signed两个组件拆分后无引用的函数，实际rg确认，金额展示函数保留在LedgerTable等实际组件内。
- 没有删除任何原始文件、数据库、卷、迁移、测试、脚本或规定文档；没有为“整洁”删除DEBUG_LOG或旧审计。
- 依赖没有盲删：Solon/Flyway传递依赖由上游使用，不能因应用未直接import认定无用；只对已命中Jackson做补丁约束，未引入Redis等基础设施。
- health.ts虽然页面不再直接调用，仍有健康交互测试引用，保留。原始PDF/MD、设计草案、人工演示和历史验收保留，用索引解释新旧状态。
- .local/node_modules/target/dist、真实.env、截图、原始日志、数据库备份不发布。新增报告、教程历史、安全脚本及既有UI文件纳入发布审查。

## 测试与失败证据

本轮初次全量回归 `.local/preflight/full-regression.log` 退出0，2026-10-18 16:08:48结束，36集成、4单元、7前端及HTTP/模拟/压力/持续检查通过；这是依赖加固前基线，**不当作最终补丁测试**。

最终补丁完整回归命令 `node scripts/compose-verify.mjs --integration`，日志 `.local/preflight/final-regression.log`；最终计数、指标和日志SHA256见docs/PREFLIGHT_RUN_20261018.json。只有生成器确认最终BUILD SUCCESS及EXIT=0后才生成该证据，不复制历史结果。

真实失败：依赖清单PowerShell参数错误、PDF控制台编码问题、错误并行执行up与restart导致143/代理就绪失败、50用户持续档PowerShell资源采样5秒超时；保留对应日志，修复后串行重跑。初次OSV发现与修复后结果分开保存。详见DEBUG_LOG，不把环境/调度失败冒充业务缺陷。

## README命令复核边界

Compose配置/构建/up、健康/代理/OpenAPI、完整测试、依赖/敏感扫描及隔离备份探针实际执行。setup:env在忽略的临时独立目录实际执行两次，验证随机密码格式及已有.env不覆盖，未动现有凭据。克隆发布通过独立目录验证。README的正常stop/更新pull/恢复现有库操作没有为验证而中断用户数据；生产备份恢复NOT VERIFIED，探针不是生产演练。模拟/压力仅在随机隔离库运行。

## 发布与剩余风险

本轮授权正常提交/推送master，禁止强推。最新实际发布提交、独立克隆完整树、禁止路径和工作区结果见GITHUB_RELEASE_REPORT最新节。包含自身的报告不伪造固定自引用提交ID，最终精确ID通过git与克隆核验。

NOT VERIFIED：20人10分钟/50人30分钟/100人60分钟、生产容量/SLA、纯锁等待逐请求归因、共享容器全局死锁统计完整性、双完整容器网络分区、宿主断电、生产TLS/安全引导/防滥用/恢复演练、镜像全层扫描、完整渗透、原始早期开发历史。人工三项OUT OF SCOPE。无权宣称评测总分或本人能力通过。
