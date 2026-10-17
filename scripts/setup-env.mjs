import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) {
  console.log('.env already exists; left unchanged.');
} else {
  const template = readFileSync('.env.example', 'utf8');
  const env = template.replace(/^DB_PASSWORD=$/m, `DB_PASSWORD=${randomBytes(32).toString('hex')}`)
    .replace(/^MYSQL_ROOT_PASSWORD=$/m, `MYSQL_ROOT_PASSWORD=${randomBytes(32).toString('hex')}`);
  writeFileSync('.env', env, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with random local database credentials.');
}
