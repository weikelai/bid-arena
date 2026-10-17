import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const [task, ...extra] = process.argv.slice(2);
if (['integration', 'all'].includes(task) && existsSync('.local/test.env') && !process.env.TEST_DB_URL) process.loadEnvFile('.local/test.env');
if (extra.length) throw new Error('Stage 1 has no suite filtering. Use the documented command without extra arguments.');
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const maven = (...args) => run('mvn', ['-B', '-f', 'backend/pom.xml', ...args]);
const frontend = (...args) => run('npm', ['--prefix', 'frontend', ...args]);
switch (task) {
  case 'build': maven('package'); frontend('run', 'build'); break;
  case 'unit': maven('test'); frontend('run', 'test'); break;
  case 'integration': frontend('run', 'build'); maven('verify', '-Pmysql-it'); break;
  case 'all': frontend('run', 'test'); frontend('run', 'build'); maven('verify', '-Pmysql-it'); break;
  case 'start': run('java', ['-jar', 'backend/target/bid-arena.jar']); break;
  default: throw new Error(`Unknown task: ${task}`);
}
