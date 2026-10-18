<script setup lang="ts">
defineProps<{transactions:{id:number;user_id:number;auction_id:number|null;request_id:string|null;type:string;delta_total:number;delta_frozen:number}[];auctionId:number|null;hold:number;released:number;captured:number}>();
const signed=(n:number)=>n>0?'+'+n:String(n);
const name=(type:string)=>({INITIAL_CREDIT:'初始积分',FREEZE:'冻结',RELEASE:'释放冻结',CAPTURE:'成交扣款'}[type]??type);
</script>
<template>
<div>
<div class="panel-heading">
<h2>资金流水</h2>
<span class="micro">PRIVATE</span>
</div>
<p class="inspector-hint">冻结不是扣款；释放冻结不会增加总余额。仅赢家支付成交价。</p>
<div class="ledger-summary">
<span>本场冻结 <b>{{hold}}</b>
</span>
<span>已释放 <b>{{released}}</b>
</span>
<span>成交扣款 <b>{{signed(captured)}}</b>
</span>
</div>
<p class="micro">本人最近200条流水 · 当前拍卖 #{{auctionId??'—'}}</p>
<table aria-label="资金流水" class="ledger-table">
<colgroup><col class="ledger-context-column"><col class="ledger-amount-column"><col class="ledger-amount-column"></colgroup>
<thead>
<tr>
<th>类型 / 关联</th>
<th scope="col">总余额<br>变化</th>
<th scope="col">冻结金额<br>变化</th>
</tr>
</thead>
<tbody>
<tr v-for="t in transactions" :key="t.id" :class="{'current-ledger':t.auction_id===auctionId}">
<td>
<span class="ledger-type" :class="'ledger-'+t.type.toLowerCase()">{{name(t.type)}}</span>
<small class="cell-detail type-code">{{t.type}}</small>
<small class="cell-detail">#{{t.id}} · 拍卖 {{t.auction_id??'初始化'}}</small>
<details v-if="t.request_id" class="request-detail"><summary>请求详情</summary><span class="request-id">{{t.request_id}}</span></details>
</td>
<td>{{signed(t.delta_total)}}</td>
<td>{{signed(t.delta_frozen)}}</td>
</tr>
</tbody>
</table>
<p v-if="!transactions.length" class="empty-copy">暂无资金流水</p>
</div>
</template>
