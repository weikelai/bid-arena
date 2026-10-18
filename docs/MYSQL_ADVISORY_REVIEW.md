# MySQL 镜像公告逐项复核（本轮）

官方清单 https://github.com/docker-library/official-images/blob/master/library/mysql 指向 8.4.11，源提交 01f90d87012e46cd174073bba02d64e9fc693ed3。拉取摘要及 Dockerfile 已核对；生产改为固定摘要的同 8.4 LTS 补丁版，既有开发卷仍为8.4.8。

上游 gosu 最新1.19仍由Go1.24.6编译，官方8.4.11也使用它。来源：https://github.com/tianon/gosu/releases/tag/1.19 及 https://github.com/tianon/gosu/blob/1.19/SECURITY.md 。上游要求按可达函数判断，不为未调用的标准库功能重编。本轮未运行对应版本govulncheck/全调用图，不能据此把包命中改为PASS；尤其保留全部4严重。没有删除gosu、替换未知二进制或使用忽略清单。

mysql-shell是可选管理客户端，附带Python包；官方入口只用mysql客户端、mysqld、gosu，并不执行mysqlsh（仅注释提及）。本项目脚本不依赖mysqlsh；删除完整可选RPM避免独立替换其捆绑库。镜像中mysql/gosu保留，初始化、SQL、迁移、权限、成交/取消、停止重启及对账均单独演练。mysqlsh管理功能不随本项目提供；需要它的外部运维工具应独立审查。没有更改应用资金核心。

修复版本仅为扫描器报告的最低修复分支，不代表当前可直接替换或该分支仍受支持。包级命中不是可利用性证明；Windows专属问题对Linux明显存在平台差异，但不在扫描中豁免。其余Go网络/证书/XML等功能可能不适用，精确可达性NOT VERIFIED。重编的最小路径是固定上游源码与可信Go补丁镜像，签名/摘要核验后构建，并完整验证身份切换、UID/GID、所有权、exec信号和本报告生命周期；本轮没有把未经完成的重编当作修复。

|公告|级别|包和扫描版本|受影响范围|扫描器修复版本|当前状态|来源|
|---|---|---|---|---|---|---|
|CVE-2026-27459|HIGH|pkg:pypi/pyopenssl@25.1.0|>=22.0.0,<26.0.0|26.0.0|PASS：最终镜像不再命中|[公告](https://scout.docker.com/v/CVE-2026-27459?s=github&n=pyopenssl&t=pypi&vr=%3E%3D22.0.0%2C%3C26.0.0)|
|CVE-2025-58187|HIGH|pkg:golang/stdlib@1.24.6|<1.24.9|1.24.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-58187?s=golang&n=stdlib&t=golang&vr=%3C1.24.9)|
|CVE-2025-58188|HIGH|pkg:golang/stdlib@1.24.6|<1.24.8|1.24.8|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-58188?s=golang&n=stdlib&t=golang&vr=%3C1.24.8)|
|CVE-2025-61723|HIGH|pkg:golang/stdlib@1.24.6|<1.24.8|1.24.8|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-61723?s=golang&n=stdlib&t=golang&vr=%3C1.24.8)|
|CVE-2025-61725|HIGH|pkg:golang/stdlib@1.24.6|<1.24.8|1.24.8|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-61725?s=golang&n=stdlib&t=golang&vr=%3C1.24.8)|
|CVE-2025-61726|HIGH|pkg:golang/stdlib@1.24.6|<1.24.12|1.24.12|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-61726?s=golang&n=stdlib&t=golang&vr=%3C1.24.12)|
|CVE-2025-61729|HIGH|pkg:golang/stdlib@1.24.6|<1.24.11|1.24.11|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-61729?s=golang&n=stdlib&t=golang&vr=%3C1.24.11)|
|CVE-2026-25679|HIGH|pkg:golang/stdlib@1.24.6|<1.25.8|1.25.8|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-25679?s=golang&n=stdlib&t=golang&vr=%3C1.25.8)|
|CVE-2026-32280|HIGH|pkg:golang/stdlib@1.24.6|<1.25.9|1.25.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-32280?s=golang&n=stdlib&t=golang&vr=%3C1.25.9)|
|CVE-2026-32281|HIGH|pkg:golang/stdlib@1.24.6|<1.25.9|1.25.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-32281?s=golang&n=stdlib&t=golang&vr=%3C1.25.9)|
|CVE-2026-32283|HIGH|pkg:golang/stdlib@1.24.6|<1.25.9|1.25.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-32283?s=golang&n=stdlib&t=golang&vr=%3C1.25.9)|
|CVE-2026-33811|HIGH|pkg:golang/stdlib@1.24.6|<1.25.10|1.25.10|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-33811?s=golang&n=stdlib&t=golang&vr=%3C1.25.10)|
|CVE-2026-33814|HIGH|pkg:golang/stdlib@1.24.6|<1.25.10|1.25.10|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-33814?s=golang&n=stdlib&t=golang&vr=%3C1.25.10)|
|CVE-2026-33818|HIGH|pkg:golang/stdlib@1.24.6|<1.25.13|1.25.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-33818?s=golang&n=stdlib&t=golang&vr=%3C1.25.13)|
|CVE-2026-39820|HIGH|pkg:golang/stdlib@1.24.6|<1.25.10|1.25.10|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-39820?s=golang&n=stdlib&t=golang&vr=%3C1.25.10)|
|CVE-2026-39836|HIGH|pkg:golang/stdlib@1.24.6|<1.25.10|1.25.10|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-39836?s=golang&n=stdlib&t=golang&vr=%3C1.25.10)|
|CVE-2026-42499|HIGH|pkg:golang/stdlib@1.24.6|<1.25.10|1.25.10|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-42499?s=golang&n=stdlib&t=golang&vr=%3C1.25.10)|
|CVE-2026-42504|HIGH|pkg:golang/stdlib@1.24.6|<1.25.11|1.25.11|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-42504?s=golang&n=stdlib&t=golang&vr=%3C1.25.11)|
|CVE-2026-56853|HIGH|pkg:golang/stdlib@1.24.6|<1.25.13|1.25.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-56853?s=golang&n=stdlib&t=golang&vr=%3C1.25.13)|
|CVE-2026-56859|HIGH|pkg:golang/stdlib@1.24.6|<1.25.13|1.25.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-56859?s=golang&n=stdlib&t=golang&vr=%3C1.25.13)|
|CVE-2026-56862|HIGH|pkg:golang/stdlib@1.24.6|<1.25.13|1.25.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-56862?s=golang&n=stdlib&t=golang&vr=%3C1.25.13)|
|CVE-2026-56866|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-56866?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-78659|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-78659?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-78660|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-78660?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-78667|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-78667?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-78669|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-78669?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-94439|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-94439?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-94440|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-94440?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-97031|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-97031?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-97032|HIGH|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-97032?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|GHSA-537c-gmf6-5ccf|HIGH|pkg:pypi/cryptography@45.0.7|>=0.5.0,<48.0.1|48.0.1|PASS：最终镜像不再命中|[公告](https://scout.docker.com/v/GHSA-537c-gmf6-5ccf?s=github&n=cryptography&t=pypi&vr=%3E%3D0.5.0%2C%3C48.0.1)|
|CVE-2026-39822|HIGH|pkg:golang/stdlib@1.24.6|<1.25.12|1.25.12|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-39822?s=golang&n=stdlib&t=golang&vr=%3C1.25.12)|
|CVE-2026-26007|HIGH|pkg:pypi/cryptography@45.0.7|<=46.0.4|46.0.5|PASS：最终镜像不再命中|[公告](https://scout.docker.com/v/CVE-2026-26007?s=github&n=cryptography&t=pypi&vr=%3C%3D46.0.4)|
|CVE-2026-69247|HIGH|pkg:pypi/cryptography@45.0.7|>=44.0.0,<50.0.0|50.0.0|PASS：最终镜像不再命中|[公告](https://scout.docker.com/v/CVE-2026-69247?s=github&n=cryptography&t=pypi&vr=%3E%3D44.0.0%2C%3C50.0.0)|
|CVE-2026-69249|HIGH|pkg:pypi/cryptography@45.0.7|>=42.0.0,<49.0.0|49.0.0|PASS：最终镜像不再命中|[公告](https://scout.docker.com/v/CVE-2026-69249?s=github&n=cryptography&t=pypi&vr=%3E%3D42.0.0%2C%3C49.0.0)|
|CVE-2026-78663|CRITICAL|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-78663?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2026-39821|CRITICAL|pkg:golang/stdlib@1.24.6|<1.25.13|1.25.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-39821?s=golang&n=stdlib&t=golang&vr=%3C1.25.13)|
|CVE-2026-56857|CRITICAL|pkg:golang/stdlib@1.24.6|<1.26.9|1.26.9|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2026-56857?s=golang&n=stdlib&t=golang&vr=%3C1.26.9)|
|CVE-2025-68121|CRITICAL|pkg:golang/stdlib@1.24.6|<1.24.13|1.24.13|FAIL：仍命中，实际可达性NOT VERIFIED|[公告](https://scout.docker.com/v/CVE-2025-68121?s=golang&n=stdlib&t=golang&vr=%3C1.24.13)|

当前各镜像公告计数：

- bid-arena-backend: {"LOW":15,"MEDIUM":22}，镜像 sha256:2a398612c73edbba9b193534fc4499625e397447f55c55a2688632a8a4ccdffb
- bid-arena-frontend: {"UNSPECIFIED":1,"MEDIUM":1}，镜像 sha256:1607de4f2d57373d35688cc30d9ed164b2150a44e1cbf751b8553fd497146ddf
- bid-arena-ingress: {"UNSPECIFIED":1,"MEDIUM":1}，镜像 sha256:3d151bd52844a10680b54d407ffe8b866c7055e4e1409f19d483a6ccb82aa27f
- bid-arena-mysql-production: {"LOW":2,"MEDIUM":24,"HIGH":30,"CRITICAL":4}，镜像 sha256:2babb82152e5281ddf9480fdd382cb79c1cba7ad6d88cd9fd9be84e5f35314ba

容器门禁FAIL，不可公开上线。原始SARIF和源码来源保存在忽略目录，公开此脱敏逐项摘要。无上游新版gosu二进制闭合全部公告；剩余低/中危OS包是否有发行方补丁以当前扫描fixedVersion为准，不能说全部暂无修复。
