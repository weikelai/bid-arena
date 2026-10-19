export const strategies=[
 {id:'CONSERVATIVE',name:'保守型',description:'控制出价频率 · 约 10 秒检查'},
 {id:'BALANCED',name:'均衡型',description:'在预算内适时跟价 · 约 3 秒检查'},
 {id:'MONITOR',name:'仅监控',description:'只观察拍卖，不自动提交出价'},
] as const;
const labels:Record<string,string>={STOPPED:'已停止',STARTING:'等待 Worker 确认',WAITING:'等待中',RUNNING:'运行中',PAUSED:'已暂停',STOPPING:'正在确认最后请求',FINISHED:'已结束',ERROR:'需要处理',DRAFT:'等待管理员开始拍卖',ALREADY_LEADING:'当前领先，不重复加价',BUDGET_MONITOR_ONLY:'已达预算上限，仅监控',MAX_BIDS_MONITOR_ONLY:'已达次数上限，仅监控',MONITOR_ONLY:'仅监控，不自动出价',BID_ACCEPTED:'出价已接受',BID_REJECTED:'出价被拒绝',CANCELLED:'拍卖已取消',MONITORING:'监控拍卖中',INSUFFICIENT_FUNDS:'可用积分不足',HTTP_401:'授权已过期或撤销',HTTP_403:'权限不足',HTTP_429:'请求频繁，正在退避',NETWORK_OR_RUNTIME:'连接异常，正在重试',PENDING_RECOVERY:'正在确认原请求结果',AGENT_WORKER_UNAVAILABLE:'Worker 暂不可用，请联系维护者检查服务',IDEMPOTENCY_CONFLICT:'重试配置已改变，请刷新任务状态',AUCTION_NOT_OPEN:'该拍卖已结束，不能创建任务',AGENT_TOKEN_INACTIVE:'授权已失效，请新建任务'};
export function agentLabel(value:string|null|undefined){return value?labels[value]??value:'等待首次决策';}
export function budgetPercent(held:number,spent:number,max:number){return max>0?Math.max(0,Math.min(100,(held+spent)/max*100)):0;}
