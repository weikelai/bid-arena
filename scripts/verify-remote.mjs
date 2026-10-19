import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {writeFileSync,existsSync} from 'node:fs';
function git(args,cwd){const r=spawnSync('git',['-c','credential.interactive=false',...args],{cwd,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error('Git '+args[0]+' failed; use existing credential manager, never paste tokens');return r.stdout.trim();}
const expected='https://github.com/weikelai/bid-arena.git';if(git(['remote','get-url','origin'])!==expected)throw Error('Unexpected origin');
if(git(['status','--porcelain']))throw Error('Commit reviewed changes before final remote verification');
const commit=git(['rev-parse','HEAD']),tree=git(['rev-parse','HEAD^{tree}']);const remote=git(['ls-remote','origin','refs/heads/master']).split(/\s+/)[0];if(remote!==commit)throw Error('Remote master differs from local HEAD');
const destination=resolve('.local','release-clone-'+randomBytes(6).toString('hex'));
git(['clone','--single-branch','--branch','master',expected,destination]);
if(git(['rev-parse','HEAD'],destination)!==commit||git(['rev-parse','HEAD^{tree}'],destination)!==tree)throw Error('Independent clone does not match release');
const files=git(['ls-files'],destination).split('\n');
const required=['README.md','DESIGN.md','FINAL_RELEASE_AUDIT.md','PRODUCTION_HARDENING_REPORT.md','TEST_EXECUTION_REPORT.md','REQUIREMENTS_MATRIX.md','compose.yaml','compose.production.yaml','backend/pom.xml','backend/src/main/java/dev/bidarena/SecurityService.java','database/migrations/V4__production_security.sql','frontend/src/App.vue','frontend/package-lock.json','backend/src/test/java/dev/bidarena/SecurityHttpIT.java','backend/src/test/java/dev/bidarena/BackupIT.java','scripts/test-isolated.mjs','scripts/audit-containers.mjs','docs/PRODUCTION_HARDENING_20261018.json'];
// Accommodate the existing Compose filename without changing the repository layout.
required.push('agent-worker/worker.mjs','agent-worker/Dockerfile','database/migrations/V5__agent_jobs.sql','backend/src/main/java/dev/bidarena/AgentJobs.java','backend/src/test/java/dev/bidarena/AgentServiceIT.java','frontend/src/components/AgentJobsPanel.vue','frontend/agent-browser-check.mjs','scripts/setup-agent.mjs','scripts/agent-service-check.mjs','scripts/agent-compose-verify.mjs','deploy/compose.agent.yaml','docs/AGENT_SERVICE_OPERATIONS.md','AGENT_SERVICE_REPORT.md');
required[required.indexOf('compose.yaml')]=files.includes('compose.yaml')?'compose.yaml':'docker-compose.yml';
for(const file of required)if(!files.includes(file)||!existsSync(resolve(destination,file)))throw Error('Missing release file '+file);
const forbidden=files.filter(file=>file.split('/').some(part=>['.local','node_modules','target','dist','.env'].includes(part)||(/^\.env\./.test(part)&&part!=='.env.example'))||/\.(?:log|bak|sql\.gz|key|pem)$/.test(file));
if(forbidden.length)throw Error('Unexpected private/generated release paths');
const report={at:new Date().toISOString(),status:'PASS',repository:expected,branch:'master',commit,tree,files:files.length,requiredFiles:required.length,forbiddenPaths:0,independentClone:destination,commands:['git ls-remote origin refs/heads/master','git -c credential.interactive=false clone --single-branch --branch master <repository> <ignored independent path>','git rev-parse HEAD','git rev-parse HEAD^{tree}','git ls-files'],limitation:'File-tree and path verification complements, not replaces, all-history credential scanning.'};
writeFileSync('.local/github-release-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
