# 本机四窗口人工验收演示

## 历史尝试与实际范围

首轮创建第9场DRAFT后，演示断言把接口省略的空end_at误判为非法；未开始、未出价。保留.local/manual-20261018/attempt1-state.json、attempt1-report.md、attempt1-stdout.log及原草稿/初始化记录。仅修正忽略目录演示脚本对null/undefined的判断，未改业务代码；关闭的仅为首轮演示进程和它启动的浏览器子进程。随后第10场完整完成。没有提交或推送本次文件。

真人演示实际账号：A为manual-a-1792305663916@example.test（ID21），B为manual-b-1792305663916@example.test（ID22），独立Agent为ID23。新用户通过正常管理员API初始化1000积分，原bidder_a/b余额分别120/0，不重置。窗口已登录，随机演示密码未写入报告或日志。管理员签发入口实际展示，但Token通过管理员真实API私下签发，未点击会显示明文的签发按钮。

观察页是本机辅助只读页，不是产品已有匿名详情功能；数据由演示控制器持管理员会话在服务端读取再过滤公开展示。Token与私有钱包不向观察页返回。窗口由headless:false的四个独立Edge进程/上下文创建；按800×500两列摆放，屏幕不足时可能重叠，仍分别保留。未验证所有桌面像素可同时可见，也没有制作录屏。

时间：2026-10-18T06:41:03.761Z。拍卖ID：10。PASS：真实界面及独立Agent演示完成。

使用现有健康Compose，未改本机3306、历史余额或数据库截止时间；创建时长180秒。原A/B余额不足时使用管理员正常创建的独立HUMAN用户，不冒充原账号。观察窗口为本机只读页面（现有产品无匿名详情页），只返回本场快照/出价/脱敏Agent决策，无钱包/Token。四个Edge独立进程及上下文，保留打开，不提交/推送。

原账号开始状态：

[
  {
    "email": "bidder_a@example.com",
    "userId": 2,
    "total": 120,
    "frozen": 0,
    "available": 120
  },
  {
    "email": "bidder_b@example.com",
    "userId": 3,
    "total": 0,
    "frozen": 0,
    "available": 0
  }
]

演示参与者：

[
  {
    "id": 21,
    "email": "manual-a-1792305663916@example.test",
    "originalEmail": "bidder_a@example.com"
  },
  {
    "id": 22,
    "email": "manual-b-1792305663916@example.test",
    "originalEmail": "bidder_b@example.com"
  }
]

最终快照：

{
  "id": 10,
  "status": "FINISHED",
  "price": 190,
  "leader": 22,
  "extensions": 3,
  "result": [
    {
      "auction_id": 10,
      "winner_id": 22,
      "price": 190,
      "reason": "SOLD",
      "settled_at": "2026-10-18T06:44:44.370657Z"
    }
  ]
}

最终钱包：

[
  {
    "userId": 21,
    "total": 1000,
    "frozen": 0,
    "available": 1000,
    "transactions": [
      {
        "id": 152,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "97099410-0777-42b0-b73f-d613b04da21f",
        "effect_key": "bid/22/97099410-0777-42b0-b73f-d613b04da21f/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -180,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:44:39.380397Z"
      },
      {
        "id": 151,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "5322664e-36f9-42bb-8a1b-c1245d76e755",
        "effect_key": "bid/21/5322664e-36f9-42bb-8a1b-c1245d76e755/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 180,
        "total_after": 1000,
        "frozen_after": 180,
        "created_at": "2026-10-18T06:44:29.320999Z"
      },
      {
        "id": 148,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "96268a64-acc4-46a8-864f-b99346a83744",
        "effect_key": "bid/22/96268a64-acc4-46a8-864f-b99346a83744/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -160,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:44:19.262969Z"
      },
      {
        "id": 147,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "c10096e8-172f-4baa-825d-a73ffe6d4596",
        "effect_key": "bid/21/c10096e8-172f-4baa-825d-a73ffe6d4596/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 160,
        "total_after": 1000,
        "frozen_after": 160,
        "created_at": "2026-10-18T06:44:09.242532Z"
      },
      {
        "id": 144,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "5e64397f-1a68-47eb-8393-cdfb7cc0e4fb",
        "effect_key": "bid/22/5e64397f-1a68-47eb-8393-cdfb7cc0e4fb/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -140,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:41:28.748113Z"
      },
      {
        "id": 143,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "cc5b9421-9983-4212-8837-1a5aede098f6",
        "effect_key": "bid/21/cc5b9421-9983-4212-8837-1a5aede098f6/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 140,
        "total_after": 1000,
        "frozen_after": 140,
        "created_at": "2026-10-18T06:41:28.733627Z"
      },
      {
        "id": 138,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "3f925fa4-b698-4752-b8a9-bb0be8f49a54",
        "effect_key": "bid/22/3f925fa4-b698-4752-b8a9-bb0be8f49a54/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -110,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:41:19.914087Z"
      },
      {
        "id": 137,
        "user_id": 21,
        "auction_id": 10,
        "request_id": "6cde1ca1-147d-42b9-b27e-95458a150e6c",
        "effect_key": "bid/21/6cde1ca1-147d-42b9-b27e-95458a150e6c/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 110,
        "total_after": 1000,
        "frozen_after": 110,
        "created_at": "2026-10-18T06:41:16.503761Z"
      }
    ]
  },
  {
    "userId": 22,
    "total": 810,
    "frozen": 0,
    "available": 810,
    "transactions": [
      {
        "id": 154,
        "user_id": 22,
        "auction_id": 10,
        "effect_key": "finish/10/22",
        "type": "CAPTURE",
        "delta_total": -190,
        "delta_frozen": -190,
        "total_after": 810,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:44:44.369744Z"
      },
      {
        "id": 153,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "97099410-0777-42b0-b73f-d613b04da21f",
        "effect_key": "bid/22/97099410-0777-42b0-b73f-d613b04da21f/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 190,
        "total_after": 1000,
        "frozen_after": 190,
        "created_at": "2026-10-18T06:44:39.381561Z"
      },
      {
        "id": 150,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "5322664e-36f9-42bb-8a1b-c1245d76e755",
        "effect_key": "bid/21/5322664e-36f9-42bb-8a1b-c1245d76e755/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -170,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:44:29.319931Z"
      },
      {
        "id": 149,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "96268a64-acc4-46a8-864f-b99346a83744",
        "effect_key": "bid/22/96268a64-acc4-46a8-864f-b99346a83744/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 170,
        "total_after": 1000,
        "frozen_after": 170,
        "created_at": "2026-10-18T06:44:19.264210Z"
      },
      {
        "id": 146,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "c10096e8-172f-4baa-825d-a73ffe6d4596",
        "effect_key": "bid/21/c10096e8-172f-4baa-825d-a73ffe6d4596/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -150,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:44:09.241584Z"
      },
      {
        "id": 145,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "5e64397f-1a68-47eb-8393-cdfb7cc0e4fb",
        "effect_key": "bid/22/5e64397f-1a68-47eb-8393-cdfb7cc0e4fb/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 150,
        "total_after": 1000,
        "frozen_after": 150,
        "created_at": "2026-10-18T06:41:28.751083Z"
      },
      {
        "id": 140,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "7e9f4621-630a-4c03-930a-c0bc2e027201",
        "effect_key": "bid/23/7e9f4621-630a-4c03-930a-c0bc2e027201/release",
        "type": "RELEASE",
        "delta_total": 0,
        "delta_frozen": -120,
        "total_after": 1000,
        "frozen_after": 0,
        "created_at": "2026-10-18T06:41:24.460206Z"
      },
      {
        "id": 139,
        "user_id": 22,
        "auction_id": 10,
        "request_id": "3f925fa4-b698-4752-b8a9-bb0be8f49a54",
        "effect_key": "bid/22/3f925fa4-b698-4752-b8a9-bb0be8f49a54/freeze",
        "type": "FREEZE",
        "delta_total": 0,
        "delta_frozen": 120,
        "total_after": 1000,
        "frozen_after": 120,
        "created_at": "2026-10-18T06:41:19.915314Z"
      }
    ]
  }
]

窗口：[{"role":"管理员","independentContext":true,"visibleLaunch":true},{"role":"真人A","independentContext":true,"visibleLaunch":true},{"role":"真人B","independentContext":true,"visibleLaunch":true},{"role":"只读观察","independentContext":true,"visibleLaunch":true}]。Agent退出：0；Token吊销：true。

出价/阶段证据：

{"time":"2026-10-18T06:41:04.692Z","event":"original balances preserved","wallets":[{"email":"bidder_a@example.com","userId":2,"total":120,"frozen":0,"available":120},{"email":"bidder_b@example.com","userId":3,"total":0,"frozen":0,"available":0}]}

{"time":"2026-10-18T06:41:09.059Z","event":"DRAFT created via UI","auctionId":10,"duration":180}

{"time":"2026-10-18T06:41:09.363Z","event":"agent token issued privately","tokenId":10,"userId":23,"permissions":["auction:read","auction:bid"]}

{"time":"2026-10-18T06:41:13.431Z","event":"started via UI"}

{"time":"2026-10-18T06:41:16.518Z","event":"human bid","userId":21,"amount":110,"result":{"seq":4,"type":"BID_ACCEPTED","amount":110,"extended":false,"replayed":false,"auctionId":10,"requestId":"6cde1ca1-147d-42b9-b27e-95458a150e6c","serverTime":"2026-10-18T06:41:16.478530Z"}}

{"time":"2026-10-18T06:41:19.926Z","event":"human bid","userId":22,"amount":120,"result":{"seq":5,"type":"BID_ACCEPTED","amount":120,"extended":false,"replayed":false,"auctionId":10,"requestId":"3f925fa4-b698-4752-b8a9-bb0be8f49a54","serverTime":"2026-10-18T06:41:19.897808Z"}}

{"time":"2026-10-18T06:41:24.444Z","event":"agent","auctionId":10,"status":"RUNNING","price":120,"seq":6}

{"time":"2026-10-18T06:41:24.467Z","event":"agent","type":"BID_ACCEPTED","seq":7,"amount":130}

{"time":"2026-10-18T06:41:24.843Z","event":"agent budget130 reached; next price exceeds strategy ceiling"}

{"time":"2026-10-18T06:41:27.498Z","event":"agent","auctionId":10,"status":"RUNNING","price":130,"seq":7}

{"time":"2026-10-18T06:41:28.743Z","event":"human bid","userId":21,"amount":140,"result":{"seq":8,"type":"BID_ACCEPTED","amount":140,"extended":false,"replayed":false,"auctionId":10,"requestId":"cc5b9421-9983-4212-8837-1a5aede098f6","serverTime":"2026-10-18T06:41:28.724495Z"}}

{"time":"2026-10-18T06:41:28.763Z","event":"human bid","userId":22,"amount":150,"result":{"seq":9,"type":"BID_ACCEPTED","amount":150,"extended":false,"replayed":false,"auctionId":10,"requestId":"5e64397f-1a68-47eb-8393-cdfb7cc0e4fb","serverTime":"2026-10-18T06:41:28.728931Z"}}

{"time":"2026-10-18T06:41:29.701Z","event":"concurrent UI submissions reconciled","price":150,"leader":22}

{"time":"2026-10-18T06:41:30.526Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:33.544Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:36.556Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:39.580Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:42.610Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:45.630Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:48.660Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:51.702Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:54.730Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:41:57.754Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:00.784Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:03.809Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:06.825Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:09.852Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:12.882Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:15.898Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:18.935Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:21.954Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:24.983Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:28.003Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:31.030Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:34.058Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:37.078Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:40.110Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:43.132Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:46.164Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:49.183Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:52.215Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:55.245Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:42:58.271Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:01.294Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:04.323Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:07.344Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:10.366Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:13.387Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:16.403Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:19.439Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:22.460Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:25.489Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:28.515Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:31.534Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:34.566Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:37.607Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:40.637Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:43.661Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:46.673Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:49.685Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:52.694Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:55.719Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:43:58.749Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:44:01.775Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:44:04.786Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:44:07.802Z","event":"agent","auctionId":10,"status":"RUNNING","price":150,"seq":9}

{"time":"2026-10-18T06:44:09.254Z","event":"human bid","userId":21,"amount":160,"result":{"seq":10,"type":"BID_ACCEPTED","amount":160,"extended":true,"replayed":false,"auctionId":10,"requestId":"c10096e8-172f-4baa-825d-a73ffe6d4596","serverTime":"2026-10-18T06:44:09.232769Z"}}

{"time":"2026-10-18T06:44:10.087Z","event":"late legal bid","oldEnd":"2026-10-18T06:44:13.394473Z","newEnd":"2026-10-18T06:44:23.394473Z","extensionCount":1}

{"time":"2026-10-18T06:44:10.817Z","event":"agent","auctionId":10,"status":"RUNNING","price":160,"seq":11}

{"time":"2026-10-18T06:44:13.826Z","event":"agent","auctionId":10,"status":"RUNNING","price":160,"seq":11}

{"time":"2026-10-18T06:44:16.846Z","event":"agent","auctionId":10,"status":"RUNNING","price":160,"seq":11}

{"time":"2026-10-18T06:44:19.276Z","event":"human bid","userId":22,"amount":170,"result":{"seq":12,"type":"BID_ACCEPTED","amount":170,"extended":true,"replayed":false,"auctionId":10,"requestId":"96268a64-acc4-46a8-864f-b99346a83744","serverTime":"2026-10-18T06:44:19.255327Z"}}

{"time":"2026-10-18T06:44:19.866Z","event":"agent","auctionId":10,"status":"RUNNING","price":170,"seq":13}

{"time":"2026-10-18T06:44:20.109Z","event":"late legal bid","oldEnd":"2026-10-18T06:44:23.394473Z","newEnd":"2026-10-18T06:44:33.394473Z","extensionCount":2}

{"time":"2026-10-18T06:44:22.885Z","event":"agent","auctionId":10,"status":"RUNNING","price":170,"seq":13}

{"time":"2026-10-18T06:44:25.903Z","event":"agent","auctionId":10,"status":"RUNNING","price":170,"seq":13}

{"time":"2026-10-18T06:44:28.929Z","event":"agent","auctionId":10,"status":"RUNNING","price":170,"seq":13}

{"time":"2026-10-18T06:44:29.330Z","event":"human bid","userId":21,"amount":180,"result":{"seq":14,"type":"BID_ACCEPTED","amount":180,"extended":true,"replayed":false,"auctionId":10,"requestId":"5322664e-36f9-42bb-8a1b-c1245d76e755","serverTime":"2026-10-18T06:44:29.312589Z"}}

{"time":"2026-10-18T06:44:30.163Z","event":"late legal bid","oldEnd":"2026-10-18T06:44:33.394473Z","newEnd":"2026-10-18T06:44:43.394473Z","extensionCount":3}

{"time":"2026-10-18T06:44:31.948Z","event":"agent","auctionId":10,"status":"RUNNING","price":180,"seq":15}

{"time":"2026-10-18T06:44:34.970Z","event":"agent","auctionId":10,"status":"RUNNING","price":180,"seq":15}

{"time":"2026-10-18T06:44:38.001Z","event":"agent","auctionId":10,"status":"RUNNING","price":180,"seq":15}

{"time":"2026-10-18T06:44:39.397Z","event":"human bid","userId":22,"amount":190,"result":{"seq":16,"type":"BID_ACCEPTED","amount":190,"extended":false,"replayed":false,"auctionId":10,"requestId":"97099410-0777-42b0-b73f-d613b04da21f","serverTime":"2026-10-18T06:44:39.373466Z"}}

{"time":"2026-10-18T06:44:40.331Z","event":"late legal bid","oldEnd":"2026-10-18T06:44:43.394473Z","newEnd":"2026-10-18T06:44:43.394473Z","extensionCount":3}

{"time":"2026-10-18T06:44:41.027Z","event":"agent","auctionId":10,"status":"RUNNING","price":190,"seq":16}

{"time":"2026-10-18T06:44:44.048Z","event":"agent","auctionId":10,"status":"RUNNING","price":190,"seq":16}

{"time":"2026-10-18T06:44:47.067Z","event":"agent","auctionId":10,"status":"FINISHED","price":190,"seq":17}

{"time":"2026-10-18T06:44:49.751Z","event":"finished bid rejected","result":{"seq":18,"type":"BID_REJECTED","error":"INVALID_STATE","replayed":false,"auctionId":10,"requestId":"after-finish-1792305663916","serverTime":"2026-10-18T06:44:49.730082Z"}}

{"time":"2026-10-18T06:44:50.045Z","event":"FINISHED; agent stopped; token revoked","auctionId":10,"result":[{"auction_id":10,"winner_id":22,"price":190,"reason":"SOLD","settled_at":"2026-10-18T06:44:44.370657Z"}],"agentExit":0}

SQL只读结果位于忽略目录.local/manual-20261018/reconciliation.log；对账状态：PASS: inconsistent=0,result=1,capture=1。冻结不是扣款；释放不增加总余额；仅最终赢家支付成交价。正式录屏/本人现场能力/外部提交未执行。
