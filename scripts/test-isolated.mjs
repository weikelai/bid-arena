import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
function sql(input){const r=spawnSync('docker',['compose','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot'],{input,encoding:'utf8'});if(r.status!==0)throw Error('Isolated test account provisioning failed');}
const user='it_'+randomBytes(8).toString('hex'),password=randomBytes(32).toString('hex');
const runtime='rt_'+randomBytes(8).toString('hex'),runtimePassword=randomBytes(32).toString('hex');
sql(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'; GRANT ALL PRIVILEGES ON \`bid\\_arena\\_it\\_%\`.* TO '${user}'@'%';`);
sql(`CREATE USER '${runtime}'@'%' IDENTIFIED BY '${runtimePassword}'; GRANT SELECT,INSERT,UPDATE,DELETE ON \`bid\\_arena\\_it\\_%\`.* TO '${runtime}'@'%';`);
const backup='bk_'+randomBytes(8).toString('hex'),backupPassword=randomBytes(32).toString('hex');
sql(`CREATE USER '${backup}'@'%' IDENTIFIED BY '${backupPassword}'; GRANT SELECT,SHOW VIEW,TRIGGER ON \`bid\\_arena\\_it\\_%\`.* TO '${backup}'@'%';`);
try{const args=['-B','-f','backend/pom.xml','verify','-Pmysql-it',...process.argv.slice(2)];const r=spawnSync('mvn',args,{shell:process.platform==='win32',stdio:'inherit',env:{...process.env,TEST_DB_URL:'jdbc:mysql://127.0.0.1:3307/?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&allowPublicKeyRetrieval=true&useSSL=false',TEST_DB_USER:user,TEST_DB_PASSWORD:password,TEST_RUNTIME_USER:runtime,TEST_RUNTIME_PASSWORD:runtimePassword,TEST_BACKUP_USER:backup,TEST_BACKUP_PASSWORD:backupPassword}});process.exitCode=r.status??1;}finally{sql(`DROP USER '${user}'@'%'; DROP USER '${runtime}'@'%'; DROP USER '${backup}'@'%';`);}
