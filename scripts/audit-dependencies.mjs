// Public package coordinates only are sent to OSV; no credentials or source files.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('.local',{recursive:true});
const run=spawnSync('mvn',['-B','-f','backend/pom.xml','dependency:list','-DincludeScope=runtime','-DoutputFile=target/security-dependencies.txt'],{shell:process.platform==='win32',encoding:'utf8'});
writeFileSync('.local/dependency-resolution.log',(run.stdout??'')+(run.stderr??''));
if(run.status!==0)throw new Error('Maven dependency resolution failed; see .local/dependency-resolution.log');
const queries=[...readFileSync('backend/target/security-dependencies.txt','utf8').matchAll(/^\s+([^\s:]+):([^:]+):jar:([^:]+):(?:compile|runtime)$/gm)].map(m=>({package:{ecosystem:'Maven',name:m[1]+':'+m[2]},version:m[3]}));
if(!queries.length)throw new Error('No runtime dependencies resolved; audit cannot pass');
try{
  const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('OSV HTTP '+response.status);
  const body=await response.json();if(!Array.isArray(body.results)||body.results.length!==queries.length)throw new Error('Incomplete OSV response');
  const findings=body.results.flatMap((r,i)=>(r.vulns??[]).map(v=>({dependency:queries[i],id:v.id})));
  const report={at:new Date().toISOString(),status:findings.length?'FAIL':'PASS',source:'https://api.osv.dev/v1/querybatch',scanned:queries.length,findings,limitation:'Known advisory matches only; no exploitability or full container scan.'};
  writeFileSync('.local/dependency-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=findings.length?1:0;
}catch(error){const report={status:'BLOCKED',error:error.message};writeFileSync('.local/dependency-audit.json',JSON.stringify(report,null,2));console.error(JSON.stringify(report));process.exitCode=2;}
