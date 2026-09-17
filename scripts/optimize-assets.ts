import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

interface ProcessResult {
  category: 'visual' | 'ui' | 'token';
  file: string;
  originalSize: number;
  compressedSize: number;
  reduction: string;
}

const rootDir = process.cwd();
const visualsDir = path.join(rootDir, 'public', 'assets', 'visuals');
const uiDir = path.join(rootDir, 'public', 'assets', 'ui');
const tokensDir = path.join(rootDir, 'public', 'assets', 'tokens');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function processDirectory(
  dir: string,
  category: 'visual' | 'ui' | 'token',
  resizeWidth?: number,
): Promise<ProcessResult[]> {
  const originalsDir = path.join(dir, '_originals');
  if (!fs.existsSync(originalsDir)) {
    fs.mkdirSync(originalsDir, { recursive: true });
  }

  const results: ProcessResult[] = [];

  // Find all .jpg files in dir or in originalsDir
  const mainJpgFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'))
    : [];

  // If already moved to _originals, use them
  const originalJpgFiles = fs.existsSync(originalsDir)
    ? fs.readdirSync(originalsDir).filter((f) => f.endsWith('.jpg'))
    : [];

  const allBaseNames = new Set<string>([
    ...mainJpgFiles.map((f) => path.basename(f, '.jpg')),
    ...originalJpgFiles.map((f) => path.basename(f, '.jpg')),
  ]);

  for (const base of allBaseNames) {
    const mainJpgPath = path.join(dir, `${base}.jpg`);
    const backupJpgPath = path.join(originalsDir, `${base}.jpg`);
    const webpPath = path.join(dir, `${base}.webp`);

    let sourceJpg = '';
    if (fs.existsSync(mainJpgPath)) {
      // Copy or move to backup
      fs.copyFileSync(mainJpgPath, backupJpgPath);
      sourceJpg = backupJpgPath;
      // Remove original from main dir so it doesn't linger
      fs.unlinkSync(mainJpgPath);
    } else if (fs.existsSync(backupJpgPath)) {
      sourceJpg = backupJpgPath;
    } else {
      continue;
    }

    const originalSize = fs.statSync(sourceJpg).size;

    let pipeline = sharp(sourceJpg);
    if (resizeWidth) {
      pipeline = pipeline.resize({ width: resizeWidth, withoutEnlargement: true });
    }
    await pipeline.webp({ quality: 85 }).toFile(webpPath);

    const compressedSize = fs.statSync(webpPath).size;
    const reduction = `${(((originalSize - compressedSize) / originalSize) * 100).toFixed(1)}%`;

    results.push({
      category,
      file: `${base}.webp`,
      originalSize,
      compressedSize,
      reduction,
    });
  }

  return results;
}

async function main() {
  console.log('开始图片后处理优化...');

  const visualResults = await processDirectory(visualsDir, 'visual', 512);
  const uiResults = await processDirectory(uiDir, 'ui'); // keep original resolution
  const tokenResults = await processDirectory(tokensDir, 'token', 512);

  const all = [...visualResults, ...uiResults, ...tokenResults];

  console.log('\n--- 压缩结果明细 ---');
  console.table(
    all.map((r) => ({
      分类: r.category,
      文件名: r.file,
      原始大小: formatBytes(r.originalSize),
      压缩后大小: formatBytes(r.compressedSize),
      压缩率: r.reduction,
    })),
  );

  const visualTotal = visualResults.reduce((acc, r) => acc + r.compressedSize, 0);
  const uiTotal = uiResults.reduce((acc, r) => acc + r.compressedSize, 0);
  const tokenTotal = tokenResults.reduce((acc, r) => acc + r.compressedSize, 0);
  const grandTotalOrig = all.reduce((acc, r) => acc + r.originalSize, 0);
  const grandTotalComp = all.reduce((acc, r) => acc + r.compressedSize, 0);

  console.log('\n--- 体积统计对比 ---');
  console.log(`16 张卡面 WebP 总大小: ${formatBytes(visualTotal)} (目标: ≤ 1.2MB)`);
  console.log(`3 张 UI 素材 WebP 总大小: ${formatBytes(uiTotal)} (目标: ≤ 1.5MB)`);
  console.log(`1 张令牌 WebP 总大小: ${formatBytes(tokenTotal)} (目标: ≤ 100KB)`);
  console.log(
    `总体积: ${formatBytes(grandTotalOrig)} -> ${formatBytes(grandTotalComp)} (目标: ≤ 2.5MB, 节省 ${(((grandTotalOrig - grandTotalComp) / grandTotalOrig) * 100).toFixed(1)}%)`,
  );
}

main().catch((err) => {
  console.error('优化失败:', err);
  process.exit(1);
});
