import {spawnSync} from 'node:child_process';
// Read-only application-schema reconciliation, never host MySQL or system tables.
const input=`SELECT COUNT(*) FROM wallets w WHERE
 total_balance<>(SELECT COALESCE(SUM(delta_total),0) FROM wallet_transactions t WHERE t.user_id=w.user_id)
 OR frozen_balance<>(SELECT COALESCE(SUM(delta_frozen),0) FROM wallet_transactions t WHERE t.user_id=w.user_id)
 OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id)
 OR total_balance<frozen_balance OR frozen_balance<0;
 SELECT COUNT(*) FROM (SELECT effect_key,COUNT(*) n FROM wallet_transactions GROUP BY effect_key HAVING n>1) d;
 SELECT COUNT(*) FROM (SELECT auction_id,COUNT(*) n FROM auction_results GROUP BY auction_id HAVING n>1) d;
 SELECT COUNT(*) FROM agent_jobs WHERE pending_id IS NOT NULL;
 SELECT MAX(CAST(version AS UNSIGNED)) FROM flyway_schema_history WHERE success=1;
 SELECT COUNT(*) FROM agent_tokens WHERE LENGTH(digest)<>32;`;
const r=spawnSync('docker',['compose','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -N -u"$MYSQL_USER" "$MYSQL_DATABASE"'],{input,encoding:'utf8'});
if(r.status!==0)throw Error('Read-only application reconciliation failed');
const values=r.stdout.trim().split(/\s+/).map(Number);
if(values.length!==6||values.some((v,i)=>v!==(i===4?5:0)))throw Error('Unexplained financial, pending, migration or token anomaly: '+values.join(','));
console.log(JSON.stringify({status:'PASS',walletLedgerHoldMismatches:values[0],duplicateLedgerEffects:values[1],duplicateAuctionResults:values[2],pendingJobs:values[3],migrationVersion:values[4],invalidTokenDigests:values[5]}));
