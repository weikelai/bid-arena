# GitHub 发布验收

目标：https://github.com/weikelai/bid-arena.git ，分支 master。

发布前远端 `git ls-remote origin` 退出0且没有分支，故不需要合并或覆盖历史。保留原有两个真实提交，不倒填历史。

实际构建和测试：`docker compose config --quiet`、`docker compose build`、`docker compose up -d --wait`、`node scripts/compose-verify.mjs --integration` 均退出0。最终回归结束2026-10-17 20:16:12+08:00：单元4、真实MySQL集成18、前端5、20人模拟59项断言，浏览器与SQL资金对账通过。独立Agent子进程新增出价及终态退出两项验证。

安全检查：`node scripts/audit-release.mjs` 检查所有可达历史blob、跟踪文件及本地日志，结合本地已知凭据和常见令牌/私钥模式；`node scripts/verify-secrets.mjs` 补充检查。真实.env、.local、构建日志、截图、数据库数据不发布。自动审计不能证明不存在任何未知秘密。

默认HTTPS非交互凭据选择曾失败128；选择已有GCM账号weikelai后dry-run退出0。不输出或存储GitHub Token，不使用force push。

实际推送及远端检查结果在下方追加；未记录成功前不视为已发布。

正式录屏、本人独立讲解及评测方外部提交：用户明确不要求本次交付，未执行。可选线上部署未执行。原始全过程开发历史不能补造；生产防护和大规模故障演练限制仍见FINAL_ACCEPTANCE_REPORT。
