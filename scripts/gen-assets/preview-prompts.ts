import { PROMPTS } from './prompts';

function cleanForMarkdownTable(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function main() {
  console.log('# 美术资产 Prompt 预览清单（共 47 条）\n');
  console.log(
    '| 序号 | 资产 ID | 中文名 | 英文名 | 分类 | 阶段/编号 | 视觉提示 | 英文生图 Prompt (promptEn) |',
  );
  console.log(
    '|:---:|:---|:---|:---|:---:|:---:|:---|:---|',
  );

  PROMPTS.forEach((item, idx) => {
    const num = item.number !== null ? String(item.number) : '-';
    const phaseOrNum = `${item.phase} / ${num}`;
    const row = [
      idx + 1,
      item.id,
      item.nameZh,
      item.nameEn,
      item.kind,
      phaseOrNum,
      cleanForMarkdownTable(item.visualHint),
      cleanForMarkdownTable(item.promptEn),
    ].join(' | ');

    console.log(`| ${row} |`);
  });

  console.log(`\n> 统计：总计 ${PROMPTS.length} 条视觉资产（卡牌 44 张 + UI 预留 3 条）。`);
}

main();
