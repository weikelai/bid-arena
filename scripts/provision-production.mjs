import {spawnSync} from 'node:child_process';
// Only the separate production project. Passwords travel through stdin, never argv/logs.
const schema=process.env.PROD_DB_NAME,migration=process.env.PROD_MIGRATION_USER,runtime=process.env.PROD_RUNTIME_USER;
for(const v of [schema,migration,runtime])if(!/^[a-z][a-z0-9_]{2,48}$/.test(v??''))throw Error('Set dedicated safe SQL identities');
if(new Set([migration,runtime]).size!==2)throw Error('Separate identities required');
const mp=process.env.PROD_MIGRATION_PASSWORD,rp=process.env.PROD_RUNTIME_PASSWORD;
for(const p of [mp,rp])if(!/^[a-f0-9]{64}$/.test(p??''))throw Error('Provide independent random 32-byte hexadecimal secrets');
if(mp===rp)throw Error('Separate credentials required');
const writes=['agent_jobs','agent_job_events','users','wallets','auctions','auction_participants','auction_holds','bid_requests','bids','wallet_transactions','auction_results','auction_events','agent_tokens','agent_token_scopes','agent_rate_windows','auth_sessions','auction_intake','login_windows'];
// MySQL requires SELECT plus UPDATE for SELECT ... FOR UPDATE on the intake gate.
const mutable=['agent_jobs','users','wallets','auctions','auction_holds','bid_requests','agent_tokens','agent_rate_windows','auth_sessions','auction_intake','login_windows'];
const runtimeGrants=`GRANT SELECT ON \`${schema}\`.* TO '${runtime}'@'%';\n`+writes.map(table=>`GRANT INSERT ON \`${schema}\`.\`${table}\` TO '${runtime}'@'%';`).join('\n')+'\n'+mutable.map(table=>`GRANT UPDATE ON \`${schema}\`.\`${table}\` TO '${runtime}'@'%';`).join('\n')+`\nGRANT INSERT ON \`${schema}\`.security_audit TO '${runtime}'@'%';\n`+['auth_sessions','agent_rate_windows','login_windows'].map(table=>`GRANT DELETE ON \`${schema}\`.\`${table}\` TO '${runtime}'@'%';`).join('\n');
const sql=process.argv.includes('--runtime')?runtimeGrants:`CREATE USER '${migration}'@'%' IDENTIFIED BY '${mp}';
CREATE USER '${runtime}'@'%' IDENTIFIED BY '${rp}';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES,DROP ON \`${schema}\`.* TO '${migration}'@'%';
GRANT SELECT ON \`${schema}\`.* TO '${runtime}'@'%';`;
const project=process.env.PRODUCTION_PROJECT??'bid-arena-production';if(!/^[a-z][a-z0-9-]{2,60}$/.test(project))throw Error('Invalid project name');
const r=spawnSync('docker',['compose','-p',project,'-f','compose.production.yaml','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot'],{input:sql,encoding:'utf8'});
if(r.status!==0)throw Error('Production provisioning failed; inspect sanitized MySQL status');
console.log('PASS: separate schema-scoped identities provisioned; existing accounts cause a closed failure, never password reset. Inspect partial provisioning before retry.');
