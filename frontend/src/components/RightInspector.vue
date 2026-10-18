<script setup lang="ts">
import {nextTick} from 'vue';
export type InspectorTab='history'|'ledger'|'agent'|'create';
const props=defineProps<{active:InspectorTab;admin:boolean}>();
const emit=defineEmits<{change:[tab:InspectorTab]}>();
const tabs:{id:InspectorTab;label:string;admin?:boolean}[]=[{id:'history',label:'出价历史'},{id:'ledger',label:'资金流水'},{id:'agent',label:'Agent',admin:true},{id:'create',label:'创建拍卖',admin:true}];
async function move(event:KeyboardEvent){const visible=tabs.filter(t=>!t.admin||props.admin);let index=visible.findIndex(t=>t.id===props.active);if(event.key==='ArrowRight')index=(index+1)%visible.length;else if(event.key==='ArrowLeft')index=(index+visible.length-1)%visible.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=visible.length-1;else return;event.preventDefault();const id=visible[index].id;emit('change',id);await nextTick();document.getElementById('tab-'+id)?.focus();}
</script>
<template>
<aside class="inspector" aria-label="辅助信息">
<div class="inspector-top">
<span class="micro">INSPECTOR / 详细信息</span>
</div>
<div class="inspector-tabs" role="tablist" aria-label="详细面板">
<template v-for="tab in tabs" :key="tab.id">
<button v-if="!tab.admin||admin" :id="'tab-'+tab.id" role="tab" :aria-selected="active===tab.id" :aria-controls="'panel-'+tab.id" :tabindex="active===tab.id?0:-1" @click="emit('change',tab.id)" @keydown="move">{{tab.label}}</button>
</template>
</div>
<div :id="'panel-'+active" class="inspector-scroll" role="tabpanel" :aria-labelledby="'tab-'+active" tabindex="0">
<slot :name="active" />
</div>
</aside>
</template>
