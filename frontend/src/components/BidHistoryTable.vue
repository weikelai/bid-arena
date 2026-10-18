<script setup lang="ts">
defineProps<{bids:{id:number;user_id:number;amount:number;seq:number;created_at?:string}[]}>();
</script>
<template>
<div>
<div class="panel-heading">
<h2>出价历史</h2>
<span class="micro">{{bids.length}} RECORDS</span>
</div>
<p class="inspector-hint">已接受的出价不代表最终成交。</p>
<table aria-label="出价历史">
<thead>
<tr>
<th>序号 / 时间</th>
<th>用户</th>
<th>金额</th>
</tr>
</thead>
<tbody>
<tr v-for="b in bids" :key="b.id">
<td>{{b.seq}}<small class="cell-detail">{{b.created_at?new Date(b.created_at).toLocaleTimeString():'—'}}</small>
</td>
<td>#{{b.user_id}}</td>
<td class="number">{{b.amount}}</td>
</tr>
</tbody>
</table>
<p v-if="!bids.length" class="empty-copy">尚无出价记录</p>
</div>
</template>
