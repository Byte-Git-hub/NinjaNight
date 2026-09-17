/**
 * 图集切割脚本：将 docs/06_assets 下的物品/表情九宫格（或多宫格）jpg
 * 按网格等分切成独立 webp（质量 85，保持深底），并更新 manifest。
 *
 * 用法：
 *   npm run gen:slice
 *   SLICE_INSET=0.04 npm run gen:slice   # 每边向内收缩 4%，用于避开网格线/边缘
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

interface SheetSpec {
  path: string;
  rows: number;
  cols: number;
  outputs: string[];
  outDir: string;
}

const ITEMS_SHEET: SheetSpec = {
  path: 'docs/06_assets/items-sheet.jpg',
  rows: 3,
  cols: 3,
  outputs: [
    'egg',
    'sakura',
    'geta',
    'rotten_pill',
    'basket',
    'secret_letter',
    'tea',
    'snowball',
    'shuriken',
  ],
  outDir: 'public/assets/items/',
};

const EMOJI_SHEET: SheetSpec = {
  path: 'docs/06_assets/emoji-sheet.jpg',
  rows: 4,
  cols: 3,
  outputs: [
    'swords',
    'kunai',
    'ninja_head',
    'noh_mask',
    'flame',
    'water',
    'moon',
    'star',
    'tea_cup',
    'bamboo',
    'kitsune_mask',
    'scroll',
  ],
  outDir: 'public/assets/emoji/',
};

const QUALITY = 85;
/** 每边向内收缩比例（0 = 紧贴网格线切），可用 env SLICE_INSET 覆盖 */
const INSET = Number(process.env.SLICE_INSET ?? '0');

interface SliceResult {
  name: string;
  file: string;
  width: number;
  height: number;
  sizeBytes: number;
}

async function sliceSheet(spec: SheetSpec): Promise<SliceResult[]> {
  const abs = path.join(ROOT, spec.path);
  const meta = await sharp(abs).metadata();
  const sheetW = meta.width ?? 0;
  const sheetH = meta.height ?? 0;
  if (!sheetW || !sheetH) throw new Error(`读不到尺寸：${spec.path}`);
  if (spec.outputs.length !== spec.rows * spec.cols) {
    throw new Error(
      `${spec.path}：outputs ${spec.outputs.length} 与网格 ${spec.rows}x${spec.cols} 不匹配`,
    );
  }
  mkdirSync(path.join(ROOT, spec.outDir), { recursive: true });
  const cellW = sheetW / spec.cols;
  const cellH = sheetH / spec.rows;
  const out: SliceResult[] = [];
  for (let i = 0; i < spec.outputs.length; i++) {
    const r = Math.floor(i / spec.cols);
    const c = i % spec.cols;
    // 用 round 对齐像素，保证相邻格无缝（1024/3 这类非整除也 OK）
    let left = Math.round(c * cellW);
    let top = Math.round(r * cellH);
    let width = Math.round((c + 1) * cellW) - left;
    let height = Math.round((r + 1) * cellH) - top;
    if (INSET > 0) {
      const ix = Math.round(width * INSET);
      const iy = Math.round(height * INSET);
      left += ix;
      top += iy;
      width -= ix * 2;
      height -= iy * 2;
    }
    const file = path.posix.join(spec.outDir, `${spec.outputs[i]}.webp`);
    const absOut = path.join(ROOT, file);
    await sharp(abs).extract({ left, top, width, height }).webp({ quality: QUALITY }).toFile(absOut);
    out.push({ name: spec.outputs[i], file, width, height, sizeBytes: statSync(absOut).size });
    console.log(`ok ${file} ${width}x${height} ${(statSync(absOut).size / 1024).toFixed(1)}KB`);
  }
  return out;
}

function updateManifest(all: SliceResult[]): void {
  const manifestPath = path.join(ROOT, 'scripts/gen-assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    summary: Record<string, number>;
    records: Array<Record<string, unknown>>;
  };
  manifest.records = manifest.records.filter((r) => r.source !== 'sheet-sliced');
  const now = new Date().toISOString();
  for (const s of all) {
    manifest.records.push({
      visualId: s.name,
      nameZh: s.name,
      file: s.file,
      source: 'sheet-sliced',
      width: s.width,
      height: s.height,
      sizeBytes: s.sizeBytes,
      addedAt: now,
    });
  }
  const sliced = manifest.records.filter((r) => r.source === 'sheet-sliced').length;
  manifest.summary.totalRecords = manifest.records.length;
  manifest.summary.sheetSliced = sliced;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest 已更新：sheet-sliced ${sliced} 条`);
}

const all: SliceResult[] = [];
all.push(...(await sliceSheet(ITEMS_SHEET)));
all.push(...(await sliceSheet(EMOJI_SHEET)));
updateManifest(all);
console.log(`共 ${all.length} 个文件`);
