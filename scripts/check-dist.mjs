import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ 不存在，请先 npm run build');
  process.exit(1);
}

const banned = [
  'local-adapter',
  'omniscientView',
  'runAutoNight',
  'finishDraft',
  'forceNightSetup',
  'src/dev',
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(dist);
let failed = false;
for (const f of files) {
  if (!/\.(js|mjs|css|html)$/i.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const b of banned) {
    if (text.includes(b)) {
      console.error(`FAIL: ${f} 含禁止片段 "${b}"`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: dist 干净（${files.length} 个文件，无 local-adapter/omniscient/dev 业务）`);
