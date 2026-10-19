<script setup lang="ts">
import {ref,computed,onMounted,onUnmounted,watch} from 'vue';
import type {Room} from '../room';
import {strategies,agentLabel,budgetPercent} from '../agent';
const props=defineProps<{api:(path:string,body?:unknown)=>Promise<any>;room:Room|null}>();
const name=ref('自动竞拍'),max=ref(300),count=ref(10),strategy=ref('BALANCED');
const jobs=ref<any[]>([]),history=ref<any[]>([]),historyId=ref(''),error=ref(''),busy=ref(false),loading=ref(true),fresh=ref(false),newTask=ref(false);
const current=computed(()=>jobs.value.filter(j=>j.auction_id===props.room?.id));
const showForm=computed(()=>newTask.value||current.value.length===0);
const canCreate=computed(()=>props.room&&['DRAFT','RUNNING'].includes(props.room.status));
let alive=true,serial=0,timer:ReturnType<typeof setInterval>;
// Ambiguous responses retry the exact same configuration and requestId.
const pendingByAuction=ref<Record<number,Record<string,unknown>|null>>({});
const pending=computed({get:()=>pendingByAuction.value[props.room?.id??0]??null,set:(value)=>{pendingByAuction.value[props.room?.id??0]=value;}});
watch(()=>props.room?.id,()=>{newTask.value=false;history.value=[];historyId.value='';});
async function refresh(){const version=++serial;try{const rows=await props.api('/admin/agent-jobs');if(alive&&version===serial){jobs.value=rows;fresh.value=true;}}catch(e){if(alive&&version===serial){fresh.value=false;error.value=agentLabel(e instanceof Error?e.message:'状态更新失败');}}finally{if(alive)loading.value=false;}}
async function run(work:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';try{await work();await refresh();}catch(e){if(alive)error.value=agentLabel(e instanceof Error?e.message:'操作失败');}finally{busy.value=false;}}
async function create(){if(!canCreate.value)return;await run(async()=>{const auctionId=props.room!.id;pending.value??={requestId:crypto.randomUUID(),name:name.value,auctionId,maxBidAmount:max.value,maxBids:count.value,strategy:strategy.value};await props.api('/admin/agent-launch',pending.value);pendingByAuction.value[auctionId]=null;if(props.room?.id===auctionId)newTask.value=false;});}
async function control(id:string,action:string){await run(async()=>{await props.api(`/admin/agent-jobs/${id}/${action}`,{});});}
async function show(id:string){const auctionId=props.room?.id;await run(async()=>{const rows=await props.api(`/admin/agent-jobs/${id}/history`);if(alive&&props.room?.id===auctionId){history.value=rows;historyId.value=id;}});}
function date(value:string){return value?new Date(value).toLocaleString():'待同步';}
function result(job:any){try{const rows=typeof job.final_result==='string'?JSON.parse(job.final_result):job.final_result;const r=Array.isArray(rows)?rows[0]:null;return r?(r.winner_id?'成交赢家 #'+r.winner_id+' · '+r.price+' 积分':'无人出价，未扣款'):agentLabel(job.last_result);}catch{return '请在中央查看服务端成交结果';}}
function usable(job:any){return !job.token_revoked_at&&!job.token_expired&&job.state!=='FINISHED';}
onMounted(()=>{void refresh();timer=setInterval(refresh,3000);});onUnmounted(()=>{alive=false;serial++;clearInterval(timer);});
</script>
<template>
 <div class="agent-panel">
  <div class="agent-heading"><div><h2>竞拍 Agent</h2><span class="micro">AUTOMATION CONTROL</span></div><span class="agent-badge">{{loading?'正在同步':current.length?'运行监控':'未创建'}}</span></div>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <p v-if="!room" class="inspector-hint">先从左侧选择目标拍卖。</p>
  <template v-else>
   <div class="agent-target"><span>目标拍卖</span><strong>{{room.title}}</strong><p>#{{room.id}} · {{room.status}} · 起拍价 {{room.start_price??100}} 积分</p></div>
   <form v-if="!loading&&showForm" @submit.prevent="create" class="agent-form">
    <label>任务名称<input v-model="name" maxlength="80" required :disabled="busy||!!pending"></label>
    <fieldset :disabled="busy||!!pending"><legend>竞价策略</legend><label v-for="s in strategies" :key="s.id" class="strategy-option"><input v-model="strategy" type="radio" :value="s.id" name="agent-strategy"><span><b>{{s.name}}</b><small>{{s.description}}</small></span></label></fieldset>
    <div class="agent-inputs"><label>最高出价（积分）<input v-model.number="max" type="number" min="110" max="1000" required :disabled="busy||!!pending"></label><label>最大出价次数<input v-model.number="count" type="number" min="1" max="10000" required :disabled="busy||!!pending"></label></div>
    <p class="agent-assurance">✓ DRAFT 自动等待管理员开始<br>✓ 自动创建专用身份并授权本场，无需复制凭证</p>
    <p class="agent-note">专用账号初始 1000 积分；最高出价不能超过该余额，也不会增加余额。授权有效期 1 小时。</p>
    <button class="full-button agent-primary" :disabled="busy||!canCreate||!fresh">{{busy?'正在创建…':pending?'重试创建并启动 Agent':'创建并启动 Agent'}}</button>
    <p v-if="!canCreate" class="agent-note">拍卖已进入终态，不能创建新任务。</p>
    <button v-if="newTask&&!pending" type="button" class="secondary full-button" @click="newTask=false">返回运行监控</button>
   </form>
   <div v-if="!showForm" class="agent-monitor">
    <p class="agent-note">状态来自服务端，约 3 秒更新。{{fresh?'':'连接中断，以下为上次数据。'}}</p>
    <article v-for="job in current" :key="job.id" class="agent-job" :data-job-id="job.id">
     <div class="agent-heading"><h3>{{job.name}}</h3><span class="agent-badge" :class="{'is-active':job.state==='RUNNING'}">{{agentLabel(job.state)}}</span></div>
     <p class="agent-note">{{strategies.find(s=>s.id===job.strategy)?.name??'均衡型'}} · Agent #{{job.user_id}}</p>
     <p v-if="job.worker_status==='UNCONFIRMED'||job.worker_status==='STALE'" class="agent-warning">{{job.worker_status==='UNCONFIRMED'?'等待独立 Worker 首次确认，尚未确认实际运行。':'Worker 未及时回报，请检查服务连接。'}}</p>
     <dl class="agent-metrics"><div><dt>当前价格</dt><dd>{{job.live_price}} <small>积分</small></dd></div><div><dt>领先者</dt><dd>{{job.live_leader?'#'+job.live_leader:'暂无'}} <small>{{job.leading?'本 Agent':''}}</small></dd></div><div><dt>出价次数</dt><dd>{{job.bid_count}} <small>/ {{job.max_bids}}</small></dd></div><div><dt>最高出价</dt><dd>{{job.max_bid}} <small>积分</small></dd></div></dl>
     <div class="agent-budget"><div><span>冻结 {{job.held_amount}} · 已扣款 {{job.spent_amount}}</span><span>{{Math.round(budgetPercent(job.held_amount,job.spent_amount,job.max_bid))}}%</span></div><progress :value="budgetPercent(job.held_amount,job.spent_amount,job.max_bid)" max="100" aria-label="预算占用比例"/><small>相对最高出价的占用，不是累计竞价金额</small></div>
     <div class="agent-decision"><span>最近决策</span><strong>{{agentLabel(job.last_result)}}</strong><small>{{date(job.last_decision)}}</small></div>
     <p v-if="job.last_error" role="alert" class="agent-warning">{{agentLabel(job.last_error)}} · 下次检查 {{date(job.next_at)}}</p>
     <p v-if="job.pending_id" class="agent-warning">上次请求结果确认中，暂停或停止不会撤销已接受报价。</p>
     <p v-if="job.state==='FINISHED'" class="agent-assurance">服务端结果：{{result(job)}}</p>
     <div class="agent-controls">
      <button v-if="job.desired==='RUNNING'&&job.state!=='FINISHED'" class="secondary" :disabled="busy||!fresh" @click="control(job.id,'pause')">暂停</button>
      <button v-else-if="usable(job)" :disabled="busy||!fresh||!!job.pending_id" @click="control(job.id,'start')">恢复运行</button>
      <button class="danger-button" :disabled="busy||!fresh||job.state==='FINISHED'||job.state==='STOPPED'" @click="control(job.id,'stop')">停止 Agent</button>
      <button class="secondary" :disabled="busy" @click="show(job.id)">决策历史</button>
     </div>
     <details class="agent-access"><summary>授权与任务详情</summary><p>Token {{job.token_revoked_at?'已撤销':job.token_expired?'已过期':'有效'}} · 到期 {{date(job.token_expires_at)}}</p><p>期望状态：{{agentLabel(job.desired)}}<br>任务 ID：{{job.id}}</p><button class="secondary" :disabled="busy||!fresh||!!job.token_revoked_at" @click="control(job.id,'revoke')">撤销 Token</button></details>
     <ol v-if="historyId===job.id" class="agent-history"><li v-for="(item,i) in history" :key="i"><small>{{date(item.created_at)}}</small>{{agentLabel(item.detail)}}</li></ol>
    </article>
    <button class="secondary full-button" :disabled="busy||!canCreate" @click="newTask=true">新建另一个 Agent</button>
   </div>
   <button v-if="!loading" type="button" class="agent-refresh" :disabled="busy" @click="refresh">刷新运行状态</button>
  </template>
 </div>
</template>
<style scoped>
.agent-panel{font-size:13px;line-height:1.6;min-width:0}.agent-panel p{overflow-wrap:anywhere}.agent-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.agent-heading h2{font-size:20px;margin:0 0 3px;letter-spacing:0}.agent-heading h3{font-size:16px;letter-spacing:0;margin:0;overflow-wrap:anywhere}.agent-heading .micro{letter-spacing:.6px}.agent-badge{flex-shrink:0;font-size:12px;border:1px solid var(--line);background:#edf1ef;padding:3px 8px;border-radius:20px;color:#35483e}.agent-badge.is-active{background:#dfede4;color:#254f3b}.agent-target{padding:20px 0 16px;margin-top:16px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.agent-target>span,.agent-decision>span{display:block;color:var(--text-secondary);font-size:13px}.agent-target strong{display:block;font-size:16px;margin-top:8px;overflow-wrap:anywhere}.agent-target p{font-size:12px;margin:5px 0 0;color:var(--text-secondary)}.agent-form label{letter-spacing:0;font-size:13px;margin:16px 0}.agent-form input:not([type=radio]){border:1px solid #bfcac7;border-radius:8px;background:#ffffff85;padding:9px 12px;min-width:0}.agent-form fieldset{border:0;padding:0;margin:22px 0 10px;min-width:0}.agent-form legend{font-size:13px;color:var(--text-secondary);padding:0}.agent-form .strategy-option{display:flex;align-items:flex-start;gap:10px;margin:12px 0}.strategy-option input{appearance:auto;display:inline;width:17px;min-height:17px;height:17px;flex:0 0 17px;margin:3px 0 0;accent-color:#456858}.strategy-option b{font-weight:500;display:block;color:var(--ink)}.strategy-option small{display:block;color:var(--text-secondary);font-size:12px;line-height:1.5}.agent-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.agent-inputs label{min-width:0}.agent-assurance{font-size:13px;color:#315842;line-height:1.8}.agent-note{font-size:12px;color:var(--text-secondary);line-height:1.7}.agent-primary{border-radius:8px;letter-spacing:0}.agent-job{padding:20px 0;border-bottom:1px solid var(--line)}.agent-metrics{display:grid;grid-template-columns:1fr 1fr;gap:15px 10px;margin:18px 0}.agent-metrics dt{font-size:12px;color:var(--text-secondary)}.agent-metrics dd{font-size:22px;margin:4px 0 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.agent-metrics dd small{font-size:12px;color:var(--text-secondary)}.agent-budget{padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.agent-budget>div{display:flex;justify-content:space-between;gap:8px;font-size:12px}.agent-budget progress{width:100%;height:7px;accent-color:#557a65}.agent-budget small{display:block;font-size:12px;color:var(--text-secondary)}.agent-decision{padding:16px 0}.agent-decision strong,.agent-decision small{display:block;margin-top:5px}.agent-decision strong{font-size:14px;font-weight:500}.agent-decision small{font-size:12px}.agent-warning{color:#85462c;background:#fbf0e6;padding:9px 10px;font-size:13px}.agent-controls{display:flex;flex-wrap:wrap;gap:8px}.agent-controls button{letter-spacing:0;padding:8px 12px;font-size:13px}.agent-access{margin-top:16px;font-size:12px;color:var(--text-secondary)}.agent-access summary{cursor:pointer}.agent-access p{font-size:12px}.agent-access button{font-size:12px;letter-spacing:0}.agent-history{padding-left:18px;font-size:12px}.agent-history li{margin-bottom:10px;overflow-wrap:anywhere}.agent-history small{display:block}.agent-refresh{background:transparent;border:0;color:#345444;letter-spacing:0;padding:8px 0;min-height:36px;margin-top:12px;font-size:13px}
</style>
