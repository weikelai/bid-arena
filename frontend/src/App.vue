<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import WalletSummary from './components/WalletSummary.vue';
import AuctionMainPanel from './components/AuctionMainPanel.vue';
import RightInspector, {type InspectorTab} from './components/RightInspector.vue';
import BidHistoryTable from './components/BidHistoryTable.vue';
import LedgerTable from './components/LedgerTable.vue';
import AgentJobsPanel from './components/AgentJobsPanel.vue';
import { acceptRoom, outcome, requiresSnapshot, secondsLeft, type Room, type RoomEvent } from './room';
const inspectorTab=ref<InspectorTab>('history');
const token=ref(sessionStorage.getItem('bid-arena-token')??'');
const role=ref(sessionStorage.getItem('bid-arena-role')??'');
const email=ref('bidder_a@example.com'),password=ref(''),notice=ref(''),error=ref(''),busy=ref(false);
const list=ref<Room[]>([]),room=ref<Room|null>(null),wallet=ref<{total_balance:number;frozen_balance:number;available_balance:number;version:number;user_id:number;server_time:string;holds:{auction_id:number;amount:number}[];transactions:{id:number;user_id:number;auction_id:number|null;request_id:string|null;created_at:string;type:string;delta_total:number;delta_frozen:number}[]}|null>(null);
const amount=ref(110),title=ref('新拍品'),duration=ref(180),connection=ref('同步中'),clock=ref(Date.now()),offset=ref(0);
const bids=ref<{id:number;user_id:number;amount:number;seq:number;created_at?:string}[]>([]);
let sessionEpoch=0,roomEpoch=0;
const selectedId=ref<number|null>(null),userId=ref<number|null>(null),walletSync=ref('同步中');
const standing=computed(()=>outcome(room.value,userId.value,bids.value.some(b=>b.user_id===userId.value)));
const roomHold=computed(()=>wallet.value?.holds?.find(h=>h.auction_id===selectedId.value)?.amount??0);
const roomLedger=computed(()=>wallet.value?.transactions.filter(t=>t.auction_id===selectedId.value)??[]);
const released=computed(()=>-roomLedger.value.filter(t=>t.type==='RELEASE').reduce((n,t)=>n+t.delta_frozen,0));
const captured=computed(()=>roomLedger.value.filter(t=>t.type==='CAPTURE').reduce((n,t)=>n+t.delta_total,0));
let timer:ReturnType<typeof setInterval>,ticking=false;
const remaining=computed(()=>secondsLeft(room.value?.end_at??null,offset.value,clock.value));
async function api(path:string,body?:unknown){const epoch=sessionEpoch;const response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token.value,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(epoch!==sessionEpoch)throw new Error('登录状态已变更，请重新操作');if(!response.ok)throw new Error(data.error??`HTTP ${response.status}`);return data;}
async function action(work:()=>Promise<void>){busy.value=true;error.value='';try{await work();}catch(e){error.value=e instanceof Error?e.message:'请求失败';}finally{busy.value=false;}}
async function refreshWallet(){const data=await api('/wallets/me');if(userId.value!==null&&data.user_id!==userId.value)return;if(wallet.value&&data.version<wallet.value.version)return;userId.value=data.user_id;wallet.value=data;walletSync.value='已同步 '+new Date(data.server_time).toLocaleTimeString();}
const visibleList=computed(()=>list.value.map(item=>item.id===room.value?.id?room.value:item));
function listCountdown(item:Room){if(item.status==='DRAFT')return '待开始';if(item.status==='RUNNING')return item.end_at?secondsLeft(item.end_at,offset.value,clock.value)+'s':'同步中';return item.status==='SETTLING'?'结算中':'已结束';}
async function refreshList(){list.value=await api('/auctions');}
async function login(){await action(async()=>{const data=await api('/auth/login',{email:email.value,password:password.value});userId.value=data.userId;token.value=data.token;role.value=data.role;sessionStorage.setItem('bid-arena-token',data.token);sessionStorage.setItem('bid-arena-role',data.role);password.value='';await refreshList();await refreshWallet();});}
function logout(){const previous=token.value;inspectorTab.value='history';sessionEpoch++;const epoch=sessionEpoch;roomEpoch++;selectedId.value=null;userId.value=null;token.value='';role.value='';sessionStorage.removeItem('bid-arena-token');sessionStorage.removeItem('bid-arena-role');room.value=null;wallet.value=null;list.value=[];bids.value=[];notice.value='';error.value='';if(previous)void fetch('/api/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+previous,'Content-Type':'application/json'},body:'{}'}).then(r=>{if(!r.ok&&epoch===sessionEpoch&&!token.value)error.value='本地已退出，但服务端吊销未确认，请检查网络或联系管理员撤销会话。';}).catch(()=>{if(epoch===sessionEpoch&&!token.value)error.value='本地已退出，但服务端吊销未确认，请检查网络或联系管理员撤销会话。';});}
async function snapshot(id:number){const epoch=roomEpoch;const data=await api(`/auctions/${id}`) as Room;const history=await api(`/auctions/${id}/bids`);if(epoch!==roomEpoch||!acceptRoom(room.value,data,selectedId.value??0))return;offset.value=Date.parse(data.server_time)-Date.now();room.value=data;bids.value=history.filter((b:{seq:number})=>b.seq<=data.seq);amount.value=Math.max(amount.value,data.current_price+data.min_increment);}
async function select(id:number){roomEpoch++;selectedId.value=id;room.value=null;bids.value=[];notice.value='';await action(async()=>{await snapshot(id);connection.value='已同步';});}
async function join(){const id=selectedId.value,epoch=roomEpoch;if(!id)return;await action(async()=>{await api(`/auctions/${id}/join`,{});if(epoch!==roomEpoch)return;await snapshot(id);notice.value='已加入拍卖';});}
async function bid(){const id=selectedId.value,epoch=roomEpoch;if(!id)return;await action(async()=>{const data=await api(`/auctions/${id}/bids`,{requestId:crypto.randomUUID(),amount:amount.value});if(epoch!==roomEpoch||selectedId.value!==id)return;notice.value=data.type==='BID_ACCEPTED'?'出价已接受（不代表最终获胜）':'出价被拒绝：'+data.error;await snapshot(id);await refreshWallet();});}
async function lifecycle(kind:string){const id=selectedId.value,epoch=roomEpoch;if(!id)return;await action(async()=>{await api(`/admin/auctions/${id}/${kind}`,{});if(epoch!==roomEpoch)return;await snapshot(id);await refreshList();await refreshWallet();});}
async function create(){await action(async()=>{const data=await api('/admin/auctions',{title:title.value,durationSeconds:duration.value});await refreshList();await select(data.id);});}
async function tick(){clock.value=Date.now();if(ticking||!token.value)return;ticking=true;const epoch=roomEpoch,id=selectedId.value;try{if(id&&room.value){const data=await api(`/auctions/${id}/events?after=${room.value.seq}`);if(epoch!==roomEpoch)return;if(connection.value!=='已同步'||data.seq>room.value.seq||requiresSnapshot(room.value.seq,data.events as RoomEvent[]))await snapshot(id);}await refreshWallet();if(epoch===roomEpoch)connection.value='已同步';}catch{connection.value='连接中断，正在重试';walletSync.value='同步中，数据可能暂未更新';}finally{ticking=false;}}
onMounted(()=>{if(token.value)action(async()=>{await refreshList();await refreshWallet();});timer=setInterval(tick,1000);});onUnmounted(()=>clearInterval(timer));
</script>

<template>
  <main :class="token?'console-layout':'auth-layout'">
    <div v-if="!token" class="system-mark" aria-hidden="true">BID_ARENA // INITIALIZED</div>
    <p v-if="!token&&error" class="error" role="alert">{{error}}</p>
    <section v-if="!token" class="login">
      <div class="welcome-panel">
<div class="panel-coordinate" aria-hidden="true">01 / BID ARENA</div>
<div class="welcome-copy">
<p class="welcome-title">HELLO BIDDER</p>
<p class="welcome-caption">EVERY BID TELLS A STORY.<br>YOUR NEXT MOVE STARTS HERE.</p>
<div class="welcome-rule">
</div>
<span class="welcome-tag">实时竞拍 · 每一次出价都有回响</span>
</div>
<span class="panel-signature" aria-hidden="true">ARENA_01</span>
</div>
      <div class="login-panel">
<div class="login-heading">
<span class="identity-mark" aria-hidden="true">
<i>
</i>
</span>
<div>
<h2>登录拍卖间</h2>
<p>连接你的竞拍身份</p>
</div>
</div>
<form @submit.prevent="login">
<label>邮箱<input v-model="email" type="email" placeholder="YOUR@EMAIL.COM" required autocomplete="username">
</label>
<label>密码<input v-model="password" type="password" placeholder="输入登录密码" required autocomplete="current-password">
</label>
<button class="login-submit" :disabled="busy">
<span>{{ busy?'正在连接':'登录' }}</span>
<span aria-hidden="true">↗</span>
</button>
</form>
<p class="login-help">演示账号及密码请参阅 README。<br>使用独立浏览器会话体验多人竞拍。</p>
<div class="login-footer">
<span>SECURE SESSION</span>
<span>● 身份验证</span>
</div>
</div>
    </section>

    <div v-else class="console-shell">
      <aside class="sidebar" aria-label="导航与资产">
        <header class="sidebar-brand">
<p class="eyebrow">AUCTION CONTROL / 01</p>
<h1>Bid Arena<span class="brand-dot">.</span>
</h1>
<p class="micro">
<span class="status-dot">
</span> NODE // CONNECTED</p>
</header>
        <div class="identity-row">
<div>
<span class="micro">{{role}} / #{{userId??'—'}}</span>
<p>竞拍控制台</p>
</div>
<button class="secondary logout-button" @click="logout">退出登录</button>
</div>
        <WalletSummary :wallet="wallet" :sync="walletSync" />
        <div class="auction-list-heading">
<h2>拍卖列表 <span>{{visibleList.length}}</span>
</h2>
<button class="text-button" :disabled="busy" @click="action(refreshList)">刷新列表</button>
</div>
        <nav class="auction-list-scroll" aria-label="拍卖列表">
<button v-for="item in visibleList" :key="item.id" class="auction" :class="{'is-selected':selectedId===item.id}" :aria-current="selectedId===item.id?'true':undefined" @click="select(item.id)">
<span class="auction-row">
<span class="state-tag" :class="'state-'+item.status.toLowerCase()">{{item.status}}</span>
<span class="micro">#{{item.id}}</span>
</span>
<strong>{{item.title}}</strong>
<span class="auction-row">
<b>{{item.current_price}} <small>PTS</small>
</b>
<span class="micro">{{listCountdown(item)}}</span>
</span>
</button>
<p v-if="!list.length" class="empty-copy">暂无拍卖</p>
</nav>
        <div v-if="role==='ADMIN'" class="sidebar-admin">
<span class="micro">ADMIN TOOLS</span>
<div>
<button class="secondary" @click="inspectorTab='create'">创建拍卖</button>
<button class="secondary" @click="inspectorTab='agent'">Agent 管理</button>
</div>
</div>
        <footer class="sidebar-footer micro">MYSQL AUTHORITY · LIVE SYNC</footer>
      </aside>
      <AuctionMainPanel :room="room" :connection="connection" :remaining="remaining" :standing="standing" :busy="busy" :admin="role==='ADMIN'" v-model:amount="amount" :notice="notice" :error="error" :bids="bids" @join="join" @bid="bid" @lifecycle="lifecycle" />
      <RightInspector :active="inspectorTab" :admin="role==='ADMIN'" @change="inspectorTab=$event">
        <template #history>
<BidHistoryTable :bids="bids" />
<p v-if="!room" class="empty-copy">选择拍卖后查看本场记录</p>
</template>
        <template #ledger>
<LedgerTable :transactions="wallet?.transactions??[]" :auction-id="selectedId" :hold="roomHold" :released="released" :captured="captured" />
</template>
        <template #create>
<div class="panel-heading">
<h2>创建拍卖</h2>
<span class="micro">ADMIN</span>
</div>
<p class="inspector-hint">新拍卖保持 DRAFT，由管理员手动开始。起拍100积分，最小加价10积分。</p>
<form @submit.prevent="create">
<label>名称<input v-model="title" maxlength="200" required>
</label>
<label>时长（秒）<input v-model.number="duration" type="number" min="1" max="86400" required>
</label>
<button class="full-button" :disabled="busy">创建 DRAFT 拍品</button>
</form>
</template>
        <template #agent>
<AgentJobsPanel v-if="role==='ADMIN'" :api="api" :room="room" />
</template>
      </RightInspector>
    </div>
  </main>
</template>

<style src="./theme.css">
</style>
<style src="./console.css">
</style>
<style src="./typography.css">
</style>
