import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';

// Synthetic pattern only: no GitHub credential is requested or used.
mkdirSync('.local',{recursive:true});
const file='.local/credential-encoding-probe-'+randomBytes(6).toString('hex')+'.log';
const marker=['gh','p_'].join('')+randomBytes(24).toString('hex');
try {
  for(const encoding of ['utf8','utf16le']){
    const body=Buffer.from(marker+'\n',encoding);
    writeFileSync(file,encoding==='utf16le'?Buffer.concat([Buffer.from([255,254]),body]):body);
    const result=spawnSync('node',['scripts/audit-release.mjs'],{encoding:'utf8',maxBuffer:1024*1024});
    assert.equal(result.status,1,encoding+' credential pattern must block publication');
    assert.ok(result.stderr.includes(file));
    assert.ok(!result.stderr.includes(marker),'Never echo a credential value');
  }
} finally {unlinkSync(file);}
console.log('PASS: UTF-8 and PowerShell UTF-16LE credential patterns block release without echoing values');
