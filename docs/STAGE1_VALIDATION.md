# 阶段1实际验证记录

日期：2026-10-17（Asia/Shanghai）。本记录不代表后续竞价、结算或Agent功能通过验收。

## 环境

Windows11 amd64；Java/javac17.0.17；Maven3.8.8；Node22.15.1；npm11.14.0；本机MySQL服务端与客户端8.4.0。已有3306服务运行但无密码root连接被拒绝，未修改该服务或数据。独立测试实例在.local/mysql-it，绑定127.0.0.1:3307，关闭MySQL X监听；随机凭据只写忽略目录，测试完成后可安全停止而保留数据。

起初PATH未发现Git，后续检查发现Git2.45.1，路径D:/28564/Documents/yyqxhds/.git/Git/cmd/git.exe；`git status --short`实际返回not a git repository。本次没有初始化仓库、提交或编造历史。

Docker诊断（原阶段记录）：首次阶段检查时CLI/桌面可执行文件缺失，Compose未执行。阶段1D复核发现Docker Desktop已安装并运行，但当前PowerShell进程PATH未刷新；显式使用 `C:\Users\28564\AppData\Local\Programs\DockerDesktop\resources\bin` 后，`docker version` 显示Client/Server 29.8.0、`docker compose version` 为v5.5.1、`docker info`成功，Docker context为desktop-linux。WSL的docker-desktop已Running、版本2。原有MySQL仍监听3306。

本阶段没有安装软件、修改系统策略、重置Docker或清理任何容器/卷。当前终端可用时在会话内加入上述resources/bin路径即可；Docker Desktop已验证无需修复。

项目配置检查：`docker compose config --quiet`退出0，服务为`mysql/backend/frontend`，镜像为`mysql:8.4.8`及两个本地构建镜像，端口默认3307/8080/5173；3306未被项目映射。Dockerfile使用MySQL8.4.8、Maven Temurin17和Node22.15.0基础镜像。首次`docker compose build`和重试均在Docker Hub授权网络超时；MySQL镜像单独拉取成功，但其它基础镜像未完成拉取，因此没有执行up、容器健康、迁移、种子或前端代理验收。日志：`.local/compose-build.log`、`.local/compose-build-retry.log`、`.local/docker-pull-mysql.log`。

阶段1D网络阻塞的真实错误：`failed to authorize: DeadlineExceeded: failed to fetch oauth token: Post "https://auth.docker.io/token": dial tcp ...:443: i/o timeout`。最小人工处理是确认Docker Desktop代理/DNS/网络可访问`auth.docker.io`和`registry-1.docker.io`，或在Docker Desktop配置经过批准的镜像加速器，然后重试`docker compose build`；不使用未经确认的镜像源，不绕过TLS。

## 已执行命令与结果

| 命令 / 操作 | 真实结果 | 证据 |
|---|---|---|
| npm --prefix frontend install（生成并更新锁文件） | 成功；锁定Vue3.5.44/Vite6.4.4/Vitest4.1.11 | frontend/package-lock.json |
| npm --prefix frontend run build | vue-tsc与Vite成功；12模块；JS约65.23kB | frontend/dist（被忽略） |
| npm --prefix frontend test | 1文件、3测试通过、0失败 | health.test.ts；最终日志 |
| npm --prefix frontend audit | 0 vulnerabilities，退出0 | 实际终端输出；升级前公告另见下节 |
| mvn -B -f backend/pom.xml test | 4单测通过、0失败、0跳过 | backend/target/surefire-reports |
| mvn -B -f backend/pom.xml verify -Pmysql-it（加载.local/test.env） | 构建成功；4单测+6集成测试通过、0失败/跳过，真实MYSQL_VERSION=8.4.0 | backend/target/failsafe-reports、.local/verify.log |
| npm run setup:env（两次） | 首次生成随机凭据；第二次保留原文件 | .env被忽略；无凭据输出 |
| node scripts/smoke.mjs | live Solon readiness、Vite index、前端API代理三项PASS | .local/smoke-backend.log；终端摘要 |
| scripts/local-mysql.ps1 stop / start | 成功停止并重启独立3307测试实例，未删除数据 | .local/mysql-it/error.log；终端ready输出 |
| python YAML safe_load compose.yaml | 成功解析mysql/backend/frontend三个服务 | 仅YAML语法检查，不是Compose运行验证 |

最终根命令`npm run test:all`退出0，汇总4后端单测、6真实MySQL集成测试、3前端测试和前后端构建；输出保存在.local/test-all.log，0失败/错误/跳过。集成测试需要真实服务且缺配置时直接失败。

最终演示库SQL核验：MySQL8.4.0；用户3；钱包3/总余额3000/冻结0；初始流水3/总发放3000；拍品DRAFT/当前价100/加价10/时长180/end_at=NULL；Flyway版本1、success=1。再次smoke通过。未修改已有3306数据。随机测试数据库在测试后已清理，演示库及本机实例目录保留。

`node scripts/verify-secrets.mjs`退出0，实际生成的本地密码未出现在交付源码/文档中（明确排除本地env、忽略的日志/数据/依赖/构建目录）；这不代表通用秘密扫描已覆盖未来所有类型Token。此前一次临时Python内联扫描因Windows引号处理产生SyntaxError，随后改用可重复Node文件扫描并通过。最终使用local-mysql.ps1 stop正常停止本次独立实例；3307/8080/5173无监听，原mysql服务仍Running，保留所有已有数据。

## 测试断言

1. 每次创建新的随机测试数据库并迁移，验证全部14张表的名称集合、InnoDB及Flyway版本历史；结束仅删除该随机库。
2. 故意改测试库历史checksum，必须抛FlywayValidateException；恢复测试值后校验通过。
3. 两个并发种子事务+重复种子，最终只有3用户、3钱包、3笔INITIAL_CREDIT，总余额3000、冻结0；演示拍品只有1件DRAFT、end_at=NULL，默认100/10/180；无Token。
4. 三账号公开演示密码通过真实哈希验证，库中不等于明文。钱包已有变更时种子不重置。
5. MySQL确实拒绝超冻/负余额（3819）、孤立外键（1452）、重复流水effect_key/重复requestId/重复成交（1062）；不同用户允许相同requestId。
6. 同事务钱包与拍卖写入后注入SQLException，两条更新全部回滚。
7. 两次启动真实可执行JAR，检查HTTP200且JSON中database=UP，重复启动后种子数额及DRAFT状态不变；进程由测试停止。
8. 前端健康反馈验证API+数据库就绪、网络失败、HTTP503及不完整响应，合计3用例；另有真实Vite→Solon代理冒烟。没有声称浏览器视觉/E2E验收。

## 实际问题与修复

- 初始真实集成测试失败：预期15张业务表，实际14。定位为测试误计数，不是迁移漏表；改为核对14张表的精确名称集合。随后6项集成测试全部通过。
- Flyway11.8.2对MySQL8.4输出“latest supported ... 8.1”兼容警告，升级到11.20.3后重新迁移验证，无该警告。
- 初始Maven依赖选择了SLF4J API1.7.36配simple2.0.17；依赖打包日志暴露冲突，增加直接API2.0.17依赖对齐，后续实际连接池和Flyway日志正常输出。
- 初选前端版本审计有6项公告；升级Vue/Vite后仍有Vitest3传递公告，核对Vitest4.1.11的Node/Vite兼容声明后升级，构建/测试复验成功且npm audit为0。没有执行不受控audit fix --force。
- 独立MySQL首启继承机器my.ini并使用skip-name-resolve，出现1130 Host 127.0.0.1 not allowed。仅停本次创建的独立实例，以--no-defaults及启动init-file建立带随机密码的loopback测试账户后恢复连接。可复用local-mysql.ps1已使用修复后的方式。原3306实例未改。
- 一次辅助Node版本查询从frontend目录错误引用./frontend/package-lock.json，报MODULE_NOT_FOUND；实际前端构建和测试不受影响，后续使用锁文件与构建输出确认版本。

## 尚未解决 / 不在阶段1范围

Docker完整启动验收被环境阻塞；当前无Git仓库/历史。生产认证引导、登录、Agent鉴权、竞价、自动结算、WebSocket、20人模拟与公开业务OpenAPI均未实现。已建表不证明资金并发规则正确；接收时间及跨场锁策略必须阶段2用真实MySQL验证。
