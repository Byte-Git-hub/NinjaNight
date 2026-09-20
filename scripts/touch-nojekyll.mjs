// GitHub Pages 默认过 Jekyll，会忽略下划线开头文件并可能改写静态行为。
// 写入空 dist/.nojekyll 跳过 Jekyll，按纯静态站点部署（跨平台，用 node 而非 touch/echo）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', '.nojekyll'), '');
console.log('OK: dist/.nojekyll 已写入');
