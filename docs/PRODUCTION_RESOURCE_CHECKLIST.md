# 公网上线前资源与操作清单

当前结论：**不可公开上线**。本地可信测试CA与隔离恢复演练不等于生产部署。以下资源未提供，不能代替用户采购、申请证书或配置外部账号。

| 资源/责任 | 配置入口与最小步骤 | 当前状态 |
|---|---|---|
| 独立服务器、持久磁盘、防火墙 | 维护者按 DEVELOPMENT.md 独立生产流程部署；仅批准TLS入口，数据库及后端不开放宿主端口；不得挂载旧开发卷或3306目录 | BLOCKED：缺真实主机 |
| 域名、DNS、可信证书、续期 | deploy/production.env.example 的 TLS_DIRECTORY 指向包含 fullchain.pem/privkey.pem 的受保护目录；证书SAN匹配域名；先 nginx -t，再 reload；过期/续期失败告警，禁止回退HTTP | BLOCKED：缺域名、可信证书和续期服务 |
| 管理员、Migration/Runtime | 独立随机凭据由 setup-production-env.mjs 生成，既有文件不覆盖；按 DEVELOPMENT.md 单次引导；DBA复核SHOW GRANTS、撤销旧账号过宽权限，审查新表授权 | 本地新库PASS；实际生产与旧账号升级 NOT VERIFIED |
| 数据库链路加密 | 当前生产模板是隔离内部网络且JDBC useSSL=false；不是数据库TLS验证。须另配置MySQL证书、可信CA及客户端 verifyIdentity，并复测连接失败关闭 | NOT VERIFIED，公开批准前需处理 |
| 真生产schema备份 | 现 encrypted-backup.mjs 有意仅支持随机隔离schema，不能直接改库名绕过；先开发并审核流式生产适配，再做新库恢复和全资金核对 | NOT VERIFIED，不宣称生产已受保护 |
| 异地加密存储和独立密钥 | 提供受限存储凭据、独立密钥托管、空间、每日/每周保留策略；先验证上传、下载、解密及恢复，未确认可恢复前不删除旧备份 | BLOCKED：缺外部资源；保留调度 NOT VERIFIED |
| 调度和告警接收端 | ops-check.mjs 可由维护者可信调度每分钟执行；通过私密环境注入 OPS_TOKEN/OPS_BACKUP_FILE，检查状态和退出码；外部接收端只发送脱敏事件摘要，需实际触发验证 | 本地探针可执行；外部告警 BLOCKED |
| 审计、日志与资金核对 | Compose已有10MiB×3轮转；安全审计长期归档、生产SQL定时对账、异常升级责任及保留周期须明确并实演 | NOT VERIFIED |
| 镜像供应链与公告 | 逐项见 MYSQL_ADVISORY_REVIEW.md；4严重/30高危仍命中，不能用假证书、忽略CVE或管理员批准文字替代修复/适用性证据 | FAIL |

部署配置模板：[生产环境变量](../deploy/production.env.example)、[独立Compose](../compose.production.yaml)、[TLS代理](../deploy/nginx-tls.conf)。模板仅为准备材料，没有真实公网部署完成证据。默认保持HTTPS_BIND=127.0.0.1；只有所有门禁关闭并批准后才能讨论公网监听。不要将凭据、证书私钥、备份或本地日志加入Git。

维护操作与命令见 [开发及运维手册](DEVELOPMENT.md)。正式录屏、本人现场讲解/临时修改、评测方外部提交仍为 OUT OF SCOPE，未执行。
