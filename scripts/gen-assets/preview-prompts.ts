import { VISUAL_PROMPTS, VISUAL_MAP } from './prompts';

function cleanForMarkdownTable(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function main() {
  console.log('# 视觉单元 Prompt 预览清单（共 19 条：16 卡牌 + 3 UI）\n');
  console.log(
    '| 序号 | 视觉单元 (visualId) | 中文名 | 英文名 | 类别 | 分组 | 覆盖的牌 (cardIds) | 视觉提示 | 英文生图 Prompt (promptEn) |',
  );
  console.log(
    '|:---:|:---|:---|:---|:---:|:---:|:---|:---|:---|',
  );

  VISUAL_PROMPTS.forEach((item, idx) => {
    const coveredCards = (VISUAL_MAP[item.visualId] ?? []).join(', ');
    const row = [
      idx + 1,
      item.visualId,
      item.nameZh,
      item.nameEn,
      item.kind,
      item.category,
      coveredCards || '-',
      cleanForMarkdownTable(item.visualHint),
      cleanForMarkdownTable(item.promptEn),
    ].join(' | ');

    console.log(`| ${row} |`);
  });

  const cardUnits = VISUAL_PROMPTS.filter((p) => p.kind !== 'ui').length;
  const uiUnits = VISUAL_PROMPTS.filter((p) => p.kind === 'ui').length;
  console.log(`\n> 统计：总计 ${VISUAL_PROMPTS.length} 条视觉单元（卡牌视觉单元 ${cardUnits} 个，覆盖 44 张牌；UI 视觉单元 ${uiUnits} 个）。`);
}

main();
