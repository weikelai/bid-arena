import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error('Git evidence failed');return r.stdout.trim();};
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const decode=file=>{const b=readFileSync(file);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'');};
const finalLog=decode('.local/hardening-regression-resumed.log');
if(!finalLog.includes('BUILD SUCCESS')||!/^EXIT=0\s*$/m.test(finalLog))throw Error('Final resumed regression has not completed successfully');
const latestLog=decode('.local/hardening-latest-full-regression.log');
if(!latestLog.includes('BUILD SUCCESS')||!/^EXIT=0\s*$/m.test(latestLog))throw Error('Latest source full regression has not completed successfully');
const securityLog=decode('.local/hardening-latest-security.log');
if(!securityLog.includes('BUILD SUCCESS')||!/^EXIT=0\s*$/m.test(securityLog))throw Error('Latest canonical-account security regression has not completed successfully');
const logs=['.local/hardening-regression-resumed.log','.local/hardening-interrupted-regression.log','.local/hardening-final-regression.log','.local/hardening-full-regression.log','.local/hardening-full-regression-retry.log','.local/hardening-final-unit.log','.local/hardening-ui-final-test.log','.local/hardening-ui-final-build.log','.local/production-compose-runtime-final.log','.local/runtime-lock-privilege-failure.log','.local/production-compose-runtime-retry.log','.local/deployment-patched.log','.local/local-tls-patched-final.log','.local/hardening-secret-final.log','.local/ops-probe-tests.log','.local/release-audit-encoding-test.log','.local/hardening-container-final.log'];
logs.push('.local/hardening-latest-full-regression.log','.local/hardening-latest-security.log','.local/canonical-account-before.log','.local/canonical-account-after.log','.local/production-compose-runtime-latest.log','.local/production-latest-readiness-failure.log','.local/production-compose-runtime-latest-retry.log','.local/hardening-compose-latest-build.log','.local/hardening-compose-latest-up.log','.local/hardening-seed-latest.log');
logs.push('backend/target/http-boundaries.log','backend/target/http-simulation.log','backend/target/browser-acceptance.log','backend/target/backup-restore.log','.local/source-address-bytecode.log');
logs.push('.local/hardening-frontend-latest-recreate.log');
const summaries=[];
for(const file of logs){if(!existsSync(file))throw Error('Missing evidence '+file);const b=readFileSync(file),text=b.includes(0)?b.toString('utf16le'):b.toString('utf8');summaries.push({file,sha256:hash(file),results:text.split(/\r?\n/).filter(s=>/Tests run:|BUILD SUCCESS|BUILD FAILURE|STABILITY_SQL|STRESS_SQL|Finished at:/.test(s)&&!s.includes('SELECT')).slice(-30)});}
const snapshots=[];
for(const file of ['backend/target/stress-20.json','backend/target/stress-50.json','backend/target/stress-100.json','backend/target/stress-200.json','backend/target/stability-20.json','backend/target/stability-50.json','backend/target/stability-100.json']){
 // Preserve extended measurements before the final standard full suite overwrites
 // target/stability-20/50.json with its shorter default grades.
 const measuredFile=file.includes('/stability-')?file.replace('backend/target/','.local/hardening-extended/'):file;
 const data=JSON.parse(readFileSync(measuredFile,'utf8'));const summary=data.summary??{};
 if(data.summary){
  if(file.includes('/stability-')){const expected={20:600,50:1800,100:3600};if(summary.status!=='PASS'||summary.requestedSeconds!==expected[summary.users])throw Error('Missing current extended stability result '+file);}
  const resources=(data.resources??[]).filter(r=>r.java?.WorkingSet64),cpu=resources.slice(1).map((r,i)=>100000*(r.java.CPU-resources[i].java.CPU)/(r.at-resources[i].at));
  snapshots.push({file,measuredFile,sha256:hash(measuredFile),...summary,...(file.includes('/stability-')?{resourceSamples:resources.length,peakJavaRssBytes:resources.length?Math.max(...resources.map(r=>r.java.WorkingSet64)):null,peakJavaCpuPercent:cpu.length?Math.max(...cpu):null,cpuDefinition:'Sum of cores, may exceed 100%; sampled deltas, not whole-run maximum',mysqlStatus:JSON.parse(readFileSync(measuredFile.replace('.json','-mysql.json'),'utf8'))}: {})});
 }
 else {const log=file.replace('.json','.log'),lines=readFileSync(log,'utf8').trim().split(/\r?\n/);snapshots.push({file,sha256:hash(file),summary:JSON.parse(lines.at(-1))});}
}
const files=[...new Set(git('ls-files','--cached','--others','--exclude-standard').split('\n'))].filter(p=>/^(backend\/src|frontend\/src|database\/migrations|deploy|scripts)\//.test(p));
for(const file of ['backend/pom.xml','backend/Dockerfile','frontend/Dockerfile','frontend/nginx.conf','frontend/browser-check.mjs','frontend/package.json','frontend/package-lock.json','compose.yaml','compose.production.yaml'])if(!files.includes(file))files.push(file);
const suites=[];
for(const dir of ['backend/target/surefire-reports','backend/target/failsafe-reports'])for(const file of readdirSync(dir).filter(n=>n.endsWith('.xml'))){
 const head=readFileSync(dir+'/'+file,'utf8').match(/<testsuite\s[^>]+>/)?.[0];if(!head)continue;
 const attr=key=>head.match(new RegExp('\\b'+key+'="([^"]*)"'))?.[1];
 const suite={name:attr('name'),tests:Number(attr('tests')),failures:Number(attr('failures')),errors:Number(attr('errors')),skipped:Number(attr('skipped')),seconds:Number(attr('time'))};
 if(![suite.tests,suite.failures,suite.errors,suite.skipped,suite.seconds].every(Number.isFinite)||suite.failures||suite.errors||suite.skipped)throw Error('Unsuccessful JUnit suite '+suite.name);suites.push(suite);
}
const report={at:new Date().toISOString(),baseCommit:git('rev-parse','HEAD'),note:'Generated before release commit. Final commit recorded separately; source file hashes bind this evidence to implementation.',logs:summaries,snapshots,sourceHashes:files.filter(existsSync).map(file=>({file,sha256:hash(file)})),tls:JSON.parse(readFileSync('.local/local-tls-result.json','utf8')),productionCompose:JSON.parse(readFileSync('.local/production-compose-result.json','utf8')),containerScan:JSON.parse(readFileSync('.local/container-audit.json','utf8')),limitations:['No public deployment/certificate renewal','Development-mode load results do not certify production login quotas or exclusive-host capacity','Production backup storage/rotation/alerts not integrated','Container advisories remain; public release security gate FAIL']};
// Only aggregate measurements and public package advisories. Never copy session rows or raw HTTP payloads.
report.suites=suites;
const jsonLines=file=>decode(file).split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const http=jsonLines('backend/target/http-boundaries.log').at(-1);
const simulation=jsonLines('backend/target/http-simulation.log').filter(row=>row.type==='SIMULATION_SUMMARY').at(-1);
if(http?.status!=='PASS'||simulation?.status!=='PASS')throw Error('HTTP or simulation evidence unsuccessful');
const browser=decode('backend/target/browser-acceptance.log');
if(!browser.includes('PASS browser:')||!browser.includes('PASS console tabs:'))throw Error('Browser acceptance evidence missing');
report.additionalVerification={httpChecks:http.checks,simulationBots:simulation.bots,simulationAssertions:simulation.assertions,browser:{status:'PASS',viewports:jsonLines('backend/target/browser-acceptance.log').filter(row=>row.scenario==='console-layout').map(({width,height,bodyWidth,bodyHeight,listOverflow,inspectorOverflow})=>({width,height,bodyWidth,bodyHeight,listOverflow,inspectorOverflow})),scope:'Admin, two users, Agent management, delayed response isolation, offline/reconnect, terminal wallet/result and no page errors'},backupNegativeCases:'Existing file/target and invalid decryption key are intentionally rejected; their nonzero child exits remain in the appended local log and are asserted by BackupIT.'};
report.standardStability=[20,50].map(users=>{
 const file=`backend/target/stability-${users}.json`,mysqlFile=file.replace('.json','-mysql.json');
 const data=JSON.parse(readFileSync(file,'utf8'));
 const seconds=users===20?120:300;
 if(data.summary?.status!=='PASS'||data.summary.requestedSeconds!==seconds||data.summary.loadSeconds<seconds)throw Error('Final standard stability result missing');
 return {file,sha256:hash(file),summary:data.summary,mysqlStatus:JSON.parse(readFileSync(mysqlFile,'utf8'))};
});
report.localSecretScan=JSON.parse(readFileSync('.local/release-security.json','utf8'));
report.applicationDependencyScan=JSON.parse(readFileSync('.local/dependency-audit.json','utf8'));
const npmAudit=JSON.parse(decode('.local/hardening-npm-final.json'));
report.npmAudit={vulnerabilities:npmAudit.metadata?.vulnerabilities,dependencies:npmAudit.metadata?.dependencies};
report.runtime=JSON.parse(readFileSync('.local/hardening-runtime-state.json','utf8'));
if(report.runtime.status!=='PASS'||report.runtime.services.length!==3)throw Error('Final Compose runtime evidence missing');
for(const service of report.runtime.services.filter(service=>service.service!=='mysql')){
 const scanned=report.containerScan.reports.find(image=>image.image==='bid-arena-'+service.service);
 if(service.health!=='healthy'||scanned?.imageId!==service.imageId)throw Error('Running image differs from scanned image');
}
const frontendCount=decode('.local/hardening-ui-final-test.log').match(/Tests\s+(\d+) passed/);
if(!frontendCount)throw Error('No actual frontend test count');
report.frontendTests=Number(frontendCount[1]);
report.regression={command:'node scripts/test-isolated.mjs',exit:0,additionalCommands:["node scripts/test-isolated.mjs '-Dit.test=SecurityIT'",'STABILITY_EXTENDED=resume100 node scripts/test-isolated.mjs'],notes:'Latest-source full standard suite follows the canonical-account fix. Extended 20/600 and 50/1800 completed in earlier attempts; 100/3600 completed in resumed full regression before the standard suite. Extended files archived before the short default grades overwrite target files. Interruption is not a successful test.'};
writeFileSync('docs/PRODUCTION_HARDENING_20261018.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: sanitized hardening evidence generated');
