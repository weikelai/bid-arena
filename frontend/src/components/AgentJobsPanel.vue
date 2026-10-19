<script setup lang="ts">
import {ref,onMounted,onUnmounted} from 'vue';
const props=defineProps<{api:(path:string,body?:unknown)=>Promise<any>;userId?:number;auctionId?:number;issued:string}>();
const emit=defineEmits<{consumed:[]}>();
const name=ref('自动竞拍'),max=ref(200),count=ref(20),jobs=ref<any[]>([]),history=ref<any[]>([]),error=ref(''),busy=ref(false);
const poll=ref(3000),timeout=ref(5000),maxErrors=ref(10);
let alive=true,timer:ReturnType<typeof setInterval>;
async function refresh(){try{const rows=await props.api('/admin/agent-jobs');if(alive)jobs.value=rows;}catch(e){if(alive)error.value=e instanceof Error?e.message:'状态更新失败';}}
async function run(work:()=>Promise<void>){busy.value=true;error.value='';try{await work();await refresh();}catch(e){error.value=e instanceof Error?e.message:'操作失败';}finally{busy.value=false;}}
async function create(){await run(async()=>{await props.api('/admin/agent-jobs',{name:name.value,userId:props.userId,auctionId:props.auctionId,token:props.issued,maxBidAmount:max.value,maxBids:count.value,pollMs:poll.value,timeoutMs:timeout.value,maxErrors:maxErrors.value});emit('consumed');});}
async function control(id:string,action:string){await run(async()=>{await props.api(`/admin/agent-jobs/${id}/${action}`,action==='configure'?{maxBidAmount:max.value,maxBids:count.value}:{});});}
async function show(id:string){await run(async()=>{const rows=await props.api(`/admin/agent-jobs/${id}/history`);if(alive)history.value=rows;});}
onMounted(()=>{void refresh();timer=setInterval(refresh,3000);});onUnmounted(()=>{alive=false;clearInterval(timer);});
</script>
<template>
 <section class="agent-jobs">
  <h3>独立自动竞拍任务</h3>
  <p>签发本场 Token 后创建任务，再点击启动。DRAFT 只等待；停止不会撤销已接受报价。</p>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <label>任务名称<input v-model="name" maxlength="80"></label>
  <label>最高报价 / 修改后的预算<input v-model.number="max" type="number" min="110" max="1000000000" step="10"></label>
  <label>最多出价次数<input v-model.number="count" type="number" min="1" max="10000"></label>
  <details><summary>高级策略与故障处理</summary>
   <p>最低合法报价；领先不抬价；预算/次数耗尽只监控；终态自动结束。</p>
   <label>轮询间隔（毫秒）<input v-model.number="poll" type="number" min="3000" max="60000"></label>
   <label>请求超时（毫秒）<input v-model.number="timeout" type="number" min="1000" max="10000"></label>
   <label>连续错误上限<input v-model.number="maxErrors" type="number" min="1" max="100"></label>
   <p>网络指数退避至 120 秒，429 退避 65 秒；未知结果先恢复，不丢弃 pending。</p>
  </details>
  <button :disabled="busy||!issued||!userId||!auctionId" @click="create">创建自动竞拍任务</button>
  <button class="secondary" :disabled="busy" @click="refresh">刷新任务状态</button>
  <article v-for="job in jobs" :key="job.id" class="agent-job">
   <h4>{{job.name}} · {{job.state}}</h4>
   <p>Agent #{{job.user_id}} / 拍卖 #{{job.auction_id}} · {{job.id}}</p>
   <p>最高价 {{job.current_price??'待同步'}} · 领先者 {{job.leader_id??'无'}} · {{job.leading?'当前领先':'未领先'}}</p>
   <p>预算 {{job.max_bid}} · 请求次数 {{job.bid_count}} / {{job.max_bids}} · 期望状态 {{job.desired}}</p>
   <p>最近决策 {{job.last_decision??'未运行'}} · {{job.last_result??'无'}} · {{job.last_error??'无错误'}}</p>
   <p>下次检查 {{job.next_at}} · Token {{job.token_revoked_at?'已吊销':job.token_expired?'已过期':'有效'}} · 到期 {{job.token_expires_at}}</p>
   <p v-if="job.pending_id">结果确认中，暂停/停止不会丢弃待确认请求。</p>
   <p v-if="job.final_result">服务端成交结果：{{job.final_result}}</p>
   <div class="agent-controls">
    <button :disabled="busy||job.state==='FINISHED'||!!job.token_revoked_at||!!job.token_expired" @click="control(job.id,'start')">启动</button>
    <button class="secondary" :disabled="busy" @click="control(job.id,'pause')">暂停</button>
    <button class="secondary" :disabled="busy" @click="control(job.id,'stop')">停止</button>
    <button class="secondary" :disabled="busy||!['STOPPED','PAUSED'].includes(job.state)||!!job.pending_id" @click="control(job.id,'configure')">应用策略</button>
    <button class="secondary" :disabled="busy" @click="show(job.id)">决策历史</button>
    <button class="secondary" :disabled="busy||!!job.token_revoked_at" @click="control(job.id,'revoke')">吊销 Token</button>
   </div>
  </article>
  <ol v-if="history.length"><li v-for="(item,index) in history" :key="index">{{item.created_at}} · {{item.type}} · {{item.detail}}</li></ol>
 </section>
</template>
<style scoped>
.agent-jobs{font-size:13px;line-height:1.6}.agent-jobs p{overflow-wrap:anywhere;color:var(--text-secondary,#46565b)}.agent-job{border-top:1px solid #d6dfe0;margin-top:16px;padding-top:12px}.agent-job h4{font-size:15px}.agent-controls{display:flex;gap:6px;flex-wrap:wrap}.agent-controls button{padding:6px 10px;font-size:12px}.agent-jobs>button{margin:6px 6px 6px 0}
</style>
