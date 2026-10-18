import {statfsSync,statSync,writeFileSync} from 'node:fs';
// Read-only local probe. Supply a short-lived admin session in OPS_TOKEN, never argv.
const base=process.env.OPS_API_BASE??'http://127.0.0.1:5173/api/v1',alerts=[],unverified=[];
if(!/^https:\/\//.test(base)&&!/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(base))throw Error('Use loopback or HTTPS');
try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});if(!r.ok)alerts.push('HEALTH_DOWN');}catch{alerts.push('HEALTH_UNREACHABLE');}
const disk=statfsSync('.');const freeBytes=Number(disk.bavail)*Number(disk.bsize);if(freeBytes<512*1024*1024)alerts.push('DISK_LOW');
if(process.env.OPS_TOKEN){try{const r=await fetch(base+'/admin/metrics',{headers:{Authorization:'Bearer '+process.env.OPS_TOKEN},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();const m=await r.json();if(m.pool.waiting>0)alerts.push('POOL_WAITING');const counters=m.metrics??{};for(const key of ['connection.acquireTimeouts','auth.loginFailures','auth.rateLimited','settlement.failures','auth.cleanupFailures'])if((counters[key]??0)>(key==='auth.loginFailures'?20:key==='auth.rateLimited'?10:0))alerts.push(key.toUpperCase().replaceAll('.','_'));}catch{unverified.push('ADMIN_METRICS');}}else unverified.push('ADMIN_METRICS');
if(process.env.OPS_BACKUP_FILE){try{if(Date.now()-statSync(process.env.OPS_BACKUP_FILE).mtimeMs>86400000)alerts.push('BACKUP_STALE');}catch{alerts.push('BACKUP_MISSING');}}else unverified.push('BACKUP_AGE');
unverified.push('SQL_RECONCILIATION_REQUIRES_ISOLATED_IT','EXTERNAL_ALERT_DELIVERY');
const report={at:new Date().toISOString(),status:alerts.length?'FAIL':'NOT VERIFIED',freeBytes,alerts,unverified,notes:'Counters are since process start, not rates. Run once/minute via an external scheduler; never include credentials or user data in notifications.'};
writeFileSync('.local/ops-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=alerts.length?1:0;
