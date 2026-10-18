<script setup lang="ts">
defineProps<{ wallet: {user_id:number;available_balance:number;total_balance:number;frozen_balance:number}|null; sync:string }>();
</script>
<template>
<section class="wallet-summary">
<div class="panel-heading">
<h2>我的钱包</h2>
<span class="micro">POINTS</span>
</div>
<template v-if="wallet">
<p class="price">{{wallet.available_balance}}<small>可用积分</small>
</p>
<div class="wallet-split">
<span>总余额 {{wallet.total_balance}}</span>
<span>冻结 {{wallet.frozen_balance}}</span>
</div>
</template>
<p v-else>钱包同步中</p>
<p class="micro wallet-sync">{{sync}}</p>
</section>
</template>
