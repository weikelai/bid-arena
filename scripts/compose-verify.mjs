import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

// SQL is passed over stdin, never interpolated into PowerShell or printed with credentials.
function docker(args, input) {
  const r = spawnSync('docker', ['compose', ...args], { input, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || `docker exited ${r.status}`);
  return r.stdout;
}
const sql = (query, root = false) => docker(['exec', '-T', 'mysql', 'sh', '-c',
  root ? 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot' : 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'], query);
const check = `SELECT version,success FROM flyway_schema_history ORDER BY installed_rank;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS credits, SUM(delta_total) AS points FROM wallet_transactions WHERE type='INITIAL_CREDIT';
SELECT id,status,current_price,end_at FROM auctions ORDER BY id;
SELECT user_id,total_balance,frozen_balance FROM wallets ORDER BY user_id;`;
mkdirSync('.local', { recursive: true });
const before = sql(check);
console.log(before);
console.log(docker(['restart', 'backend']));
let ready = false;
for (let i=0;i<40;i++) {
  try { const r = await fetch('http://127.0.0.1:5173/api/v1/health'); if(r.ok && (await r.json()).database === 'UP') {ready=true;break;} } catch {}
  await new Promise(r=>setTimeout(r,1000));
}
if(!ready) throw new Error('Frontend proxy readiness failed after restart');
const after = sql(check);
if(before !== after) throw new Error('Database facts changed across restart');
console.log('PASS: frontend proxy, migration, and unchanged users/credits/wallets/auctions after backend restart');
writeFileSync('.local/compose-data-verification.log', before + '\nRESTART_IDENTICAL=true\n');
if(process.argv.includes('--integration')) {
  for(const args of [['--prefix','frontend','test'],['--prefix','frontend','run','build']]) {
    const r=spawnSync('npm',args,{shell:process.platform==='win32',stdio:'inherit'});
    if(r.status!==0)throw new Error('Frontend verification failed');
  }
  const name='it_'+randomBytes(8).toString('hex'), password=randomBytes(32).toString('hex');
  sql(`CREATE USER '${name}'@'%' IDENTIFIED BY '${password}'; GRANT ALL PRIVILEGES ON \`bid\\_arena\\_it\\_%\`.* TO '${name}'@'%';`, true);
  try {
    const r=spawnSync('mvn', ['-B','-f','backend/pom.xml','verify','-Pmysql-it'], {
      shell:process.platform==='win32',stdio:'inherit',env:{...process.env,
        TEST_DB_URL:'jdbc:mysql://127.0.0.1:3307/?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&allowPublicKeyRetrieval=true&useSSL=false',
        TEST_DB_USER:name,TEST_DB_PASSWORD:password}});
    if(r.status!==0) throw new Error(`Real MySQL tests exited ${r.status}`);
  } finally { sql(`DROP USER '${name}'@'%';`,true); }
}
