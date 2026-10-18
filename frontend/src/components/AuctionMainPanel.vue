<script setup lang="ts">
import type {Room} from '../room';
defineProps<{room:Room|null;connection:string;remaining:number;standing:string;busy:boolean;admin:boolean;amount:number;notice:string;error:string;bids:{id:number;user_id:number;amount:number;seq:number}[]}>();
const emit=defineEmits<{'update:amount':[amount:number];join:[];bid:[];lifecycle:[kind:string]}>();
</script>
<template>
<div class="workspace">
<section v-if="room" class="room">
<div class="room-heading">
<div>
<p class="eyebrow">{{room.status}} · {{connection}} · seq {{room.seq}}</p>
<h2>{{room.title}}</h2>
</div>
<span class="auction-id">AUCTION / #{{room.id}}</span>
</div>
<div class="stats">
<div>
<small>当前最高价</small>
<p class="price">{{room.current_price}}</p>
</div>
<div>
<small>剩余时间</small>
<p class="price countdown">{{room.status==='DRAFT'?'待开始':room.status==='RUNNING'?remaining+'s':'已结束'}}</p>
</div>
</div>
<div class="secondary-stats">
<div>
<small>当前领先者</small>
<strong>{{room.leader_id?'#'+room.leader_id:'暂无'}}</strong>
</div>
<div>
<small>延时保护</small>
<strong>已延时 {{room.extension_count}}/3 次</strong>
</div>
<div>
<small>参与人数</small>
<strong>{{room.participants.length}} <span>位</span>
</strong>
</div>
</div>
<p v-if="room.end_at" class="deadline">截止 {{new Date(room.end_at).toLocaleString()}}</p>
<div class="status-banner" :class="{'is-leading':standing==='你目前领先','is-finished':room.status==='FINISHED'}">
<span class="status-dot">
</span>
<p data-testid="standing">{{standing}}</p>
</div>
<div v-for="result in room.result.filter(r=>r.reason!=='CANCELLED')" :key="result.reason" class="notice result-card">
<div>
<span class="micro">成交结果 {{result.reason}}</span>
<h3>赢家 {{result.winner_id?'#'+result.winner_id:'无'}}</h3>
</div>
<p class="result-price">
<small>成交价</small>{{result.price}}<span>PTS</span>
</p>
</div>
<p v-if="room.status==='CANCELLED'" class="notice">CANCELLED · 拍卖已取消，冻结已释放</p>
<div class="bid-action">
<div class="panel-heading">
<h3>竞拍操作</h3>
<span class="micro">MIN STEP / {{room.min_increment}} PTS</span>
</div>
<div class="controls">
<button class="secondary" :disabled="busy||!['DRAFT','RUNNING'].includes(room.status)" @click="emit('join')">加入拍卖</button>
<label>出价积分<input :value="amount" @input="emit('update:amount',Number(($event.target as HTMLInputElement).value))" type="number" :min="room.current_price+room.min_increment" step="10">
</label>
<button :disabled="busy||room.status!=='RUNNING'" @click="emit('bid')">提交出价</button>
</div>
<p v-if="notice" class="action-feedback" role="status">{{notice}}</p>
<p v-if="error" class="error" role="alert">{{error}}</p>
<div v-if="admin" class="admin-controls">
<span class="micro">ADMIN</span>
<button class="secondary" :disabled="busy||room.status!=='DRAFT'" @click="emit('lifecycle','start')">开始拍卖</button>
<button class="danger-button" :disabled="busy||!['DRAFT','RUNNING'].includes(room.status)" @click="emit('lifecycle','cancel')">取消拍卖</button>
</div>
</div>
</section>
<section v-else class="workspace-empty">
<span class="empty-symbol" aria-hidden="true">◇</span>
<p class="micro">WORKSPACE / READY</p>
<h2>选择一件拍品</h2>
<p>从左侧选择拍卖，查看实时价格与竞拍状态。</p>
<p v-if="notice" role="status">{{notice}}</p>
<p v-if="error" class="error" role="alert">{{error}}</p>
</section>
<div v-if="room" class="workspace-bottom">
<section class="participants-panel">
<div class="panel-heading">
<h3>参与者（{{room.participants.length}}）</h3>
<span class="micro">NODES</span>
</div>
<div class="participant-scroll">
<p v-for="p in room.participants" :key="p.user_id">
<span class="avatar-dot">{{p.user_id}}</span>
<span class="participant-email">{{p.email}}</span>
<span class="kind-tag" :class="{'agent-tag':p.kind==='AGENT'}">{{p.kind}}</span>
</p>
<p v-if="!room.participants.length" class="empty-copy">等待第一位参与者</p>
</div>
</section>
<section class="recent-panel">
<div class="panel-heading">
<h3>最近出价</h3>
<span class="micro">LIVE FEED</span>
</div>
<ol class="recent-feed">
<li v-for="b in bids.slice(-4).reverse()" :key="b.id">
<span class="micro">SEQ {{b.seq}}</span>
<span>用户 #{{b.user_id}}</span>
<strong>{{b.amount}} <small>PTS</small>
</strong>
</li>
</ol>
<p v-if="!bids.length" class="empty-copy">尚无出价，完整记录见右侧。</p>
<p class="micro">记录来自服务端 · 最终赢家以成交结果为准</p>
</section>
</div>
</div>
</template>
