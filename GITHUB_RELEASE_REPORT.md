# GitHub 发布验收

目标：https://github.com/weikelai/bid-arena.git ，分支 master。

发布前远端 `git ls-remote origin` 退出0且没有分支，故不需要合并或覆盖历史。保留原有两个真实提交，不倒填历史。

实际构建和测试：`docker compose config --quiet`、`docker compose build`、`docker compose up -d --wait`、`node scripts/compose-verify.mjs --integration` 均退出0。最终回归结束2026-10-17 20:16:12+08:00：单元4、真实MySQL集成18、前端5、20人模拟59项断言，浏览器与SQL资金对账通过。独立Agent子进程新增出价及终态退出两项验证。

安全检查：`node scripts/audit-release.mjs` 检查所有可达历史blob、跟踪文件及本地日志，结合本地已知凭据和常见令牌/私钥模式；`node scripts/verify-secrets.mjs` 补充检查。真实.env、.local、构建日志、截图、数据库数据不发布。自动审计不能证明不存在任何未知秘密。

默认HTTPS非交互凭据选择曾失败128；选择已有GCM账号weikelai后dry-run退出0。不输出或存储GitHub Token，不使用force push。

实际推送及远端检查结果在下方追加；未记录成功前不视为已发布。

正式录屏、本人独立讲解及评测方外部提交：用户明确不要求本次交付，未执行。可选线上部署未执行。原始全过程开发历史不能补造；生产防护和大规模故障演练限制仍见FINAL_ACCEPTANCE_REPORT。

## 实际发布成功及远端验证

代码发布提交：c41ffb91bfd5129a0b47ee28783d8f71ccf51247。
`git -c credential.interactive=false push -u origin master` 退出0，新建远端master；`git ls-remote origin refs/heads/master` 返回同一完整提交ID。
`git -c credential.interactive=false clone --no-checkout https://github.com/weikelai/bid-arena.git .local/github-release-check` 退出0。对独立远端克隆执行 `git ls-tree -r --name-only HEAD`，确认Vue源码、Solon源码、V1–V3迁移、后端测试、前端测试、模拟与Agent脚本、Compose和全部规定文档实际存在。远端不含.env、.local、日志、target、dist或node_modules。原始评测Markdown及PDF保留。

推送前提交后安全扫描：PASS，3提交、77历史blob、3个已知本地凭据匹配项来源、33份本地证据文件；未发现泄露。这里的3是检查的本地凭据数，不是泄露数。后续文档收尾提交同样必须扫描、正常推送并核对远端HEAD；最新提交ID以 `git ls-remote origin refs/heads/master` 为准，报告不嵌入包含自身的提交哈希。

最终容器均healthy：mysql 127.0.0.1:3307→3306，backend 127.0.0.1:8080→8080，frontend 127.0.0.1:5173→80。本机MySQL3306仍为PID8864，未停止、修改或删除。没有down -v、prune或数据重置。

GitHub远端发布状态为PASS；正式录屏、本人讲解及评测方外部提交仍为OUT OF SCOPE，未执行；全过程早期历史不能补造，可选线上部署未执行，不宣称原始评分全部通过。
## 最终全面回归证据

2026-10-17 20:31:00+08:00，完整回归退出0：4单元、21真实MySQL集成、5前端测试，失败/错误/跳过均0；20人seed42模拟65断言，winner24 price370；新增动态凭据在后端日志及前端包中不存在的检查通过。Edge扩展测试包括旧钱包响应跨登录隔离、出价历史、自动SOLD及余额890/冻结0。详见TEST_EXECUTION_REPORT.md及需求矩阵新附表。原始MySQL3306仍PID8864，三个容器healthy。