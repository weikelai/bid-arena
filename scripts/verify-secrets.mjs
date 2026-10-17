import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const values = [];
for (const file of ['.env', '.local/test.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^[A-Z_]*PASSWORD=.+/.test(line)) values.push(line.slice(line.indexOf('=') + 1));
  }
}
const ignored = new Set(['.local', '.git', 'node_modules', 'target', 'dist']);
const leaks = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.env')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile() && values.some(value => readFileSync(path).includes(Buffer.from(value)))) leaks.push(path);
  }
}
scan('.');
if (!values.length) throw new Error('No generated local credentials found; scan cannot verify them');
if (leaks.length) throw new Error(`Generated credentials found in: ${leaks.join(', ')}`);
console.log('PASS: generated local credentials absent from deliverable files');
