import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
mkdirSync('.local',{recursive:true});
const reports=[];
for(const image of ['bid-arena-backend','bid-arena-frontend','bid-arena-ingress','bid-arena-mysql-production']){
 const file='.local/audit-'+image+'.sarif';
 const r=spawnSync('docker',['scout','cves','local://'+image,'--format','sarif','--output',file],{encoding:'utf8',maxBuffer:16*1024*1024});
 writeFileSync('.local/audit-'+image+'.log',(r.stdout??'')+(r.stderr??''));
 if(r.status!==0){reports.push({image,status:'BLOCKED',exitCode:r.status});continue;}
 const sarif=JSON.parse(readFileSync(file,'utf8')),counts={};const findings=sarif.runs.flatMap(run=>(run.tool.driver.rules??[]).map(rule=>{const p=rule.properties??{},severity=p.cvssV3_severity??'UNSPECIFIED';counts[severity]=(counts[severity]??0)+1;return {id:rule.id,severity,fixedVersion:p.fixed_version,packages:p.purls};}));
 const inspected=spawnSync('docker',['image','inspect',image,'--format','{{.Id}}'],{encoding:'utf8'});
 reports.push({image,imageId:inspected.stdout?.trim(),status:findings.length?'FAIL':'PASS',toolExitCode:r.status,counts,findings});
}
const report={at:new Date().toISOString(),status:reports.some(r=>r.status==='BLOCKED')?'BLOCKED':reports.some(r=>r.status==='FAIL')?'FAIL':'PASS',reports,limitation:'Advisory package matches, not proof of exploitability. Exit zero from Scout means report generated, not vulnerability-free.'};
writeFileSync('.local/container-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({at:report.at,status:report.status,reports:reports.map(({findings,...summary})=>summary)}));process.exitCode=report.status==='PASS'?0:report.status==='FAIL'?1:2;
