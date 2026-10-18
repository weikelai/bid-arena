// Read-only checks against the local frontend reverse proxy; no account or money mutation.
import assert from 'node:assert/strict';
const base=process.env.FRONTEND_BASE_URL??'http://127.0.0.1:5173';
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
for(const path of ['/','/api/v1/health','/api/v1/openapi.json']){
  const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});check(r.ok,path+' HTTP success');
  check(r.headers.get('x-content-type-options')==='nosniff',path+' nosniff');
  check(r.headers.get('x-frame-options')==='DENY',path+' frame protection');
  check(r.headers.get('referrer-policy')==='no-referrer',path+' referrer');
  check(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),path+' CSP');
  if(path.endsWith('/health'))check((await r.json()).database==='UP','database ready through proxy');
  else if(path.endsWith('openapi.json')){const spec=await r.json();check(spec.openapi==='3.0.3','OpenAPI version');for(const p of ['/api/v1/auth/login','/api/v1/wallets/me','/api/v1/admin/agent-tokens','/api/v1/auctions/{id}/bids'])check(Boolean(spec.paths[p]),'OpenAPI '+p);}
  else check((await r.text()).includes('id="app"'),'Vue entry');
}
const denied=await fetch(new URL('/api/v1/admin/metrics',base),{signal:AbortSignal.timeout(10000)});check(denied.status===401,'metrics denied without credentials');check(!denied.headers.has('access-control-allow-origin'),'no permissive cross-origin header');
console.log(JSON.stringify({status:'PASS',checks,base,scope:'read-only proxy, security headers, health, OpenAPI and anonymous denial'}));
