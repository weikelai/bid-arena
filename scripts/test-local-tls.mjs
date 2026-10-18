import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {request} from 'node:https';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const dir=resolve('.local/tls-'+randomBytes(6).toString('hex'));mkdirSync(dir,{recursive:true});
const openssl=process.env.OPENSSL_BIN??'openssl',name='bid-arena-tls-'+randomBytes(6).toString('hex');
writeFileSync(dir+'/openssl.cnf','[req]\ndistinguished_name=dn\n[dn]\n');
process.env.OPENSSL_CONF=dir+'/openssl.cnf';
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0)throw Error(`${cmd} ${args[0]} failed (exit ${r.status})`);return r.stdout.trim();}
run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/ca.key','-out',dir+'/ca.pem','-days','1','-subj','/CN=Bid Arena Local Test CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
run(openssl,['req','-newkey','rsa:2048','-nodes','-keyout',dir+'/privkey.pem','-out',dir+'/leaf.csr','-subj','/CN=localhost']);
writeFileSync(dir+'/extensions.cnf','subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n');
run(openssl,['x509','-req','-in',dir+'/leaf.csr','-CA',dir+'/ca.pem','-CAkey',dir+'/ca.key','-CAcreateserial','-out',dir+'/fullchain.pem','-days','1','-extfile',dir+'/extensions.cnf']);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const id=run('docker',['compose','ps','-q','frontend']);const networks=JSON.parse(run('docker',['inspect',id]))[0].NetworkSettings.Networks;const network=Object.keys(networks)[0];
let started=false;
function get(path,ca){return new Promise((resolve,reject)=>{const r=request({host:'127.0.0.1',port,path,ca,servername:'localhost',timeout:5000},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body,tls:res.socket?.getProtocol?.()}));});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('TLS timeout')));r.end();});}
try{
 run('docker',['run','-d','--name',name,'--network',network,'-p',`127.0.0.1:${port}:8443`,'--mount',`type=bind,src=${resolve('deploy/nginx-tls.conf')},dst=/etc/nginx/conf.d/default.conf,readonly`,'--mount',`type=bind,src=${dir},dst=/run/tls,readonly`,'bid-arena-ingress']);started=true;
 let result,lastError;for(let i=0;i<30;i++){try{result=await get('/api/v1/health',readFileSync(dir+'/ca.pem'));if(result.status===200)break;}catch(e){lastError=e.message;}await new Promise(r=>setTimeout(r,500));}
 if(!result){writeFileSync('.local/local-tls-diagnostic.log',String(lastError)+'\n'+run('docker',['logs',name]));}
 assert.equal(result?.status,200);assert.equal(JSON.parse(result.body).database,'UP');
 for(const header of ['strict-transport-security','content-security-policy','x-content-type-options','referrer-policy','permissions-policy'])assert.ok(result.headers[header],header);
 assert.equal((await get('/',readFileSync(dir+'/ca.pem'))).status,200);
 await assert.rejects(()=>get('/api/v1/health',undefined)); // untrusted certificate must fail
 const report={status:'PASS',at:new Date().toISOString(),checks:['local CA explicitly trusted; certificate and hostname verified','untrusted client rejects certificate','TLS proxy health and frontend 200','HSTS/CSP/nosniff/referrer/permissions headers present'],limitation:'Local test CA only. No public certificate, renewal, public DNS or cloud deployment validated.'};
 writeFileSync('.local/local-tls-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(started)run('docker',['rm','-f',name]);}
