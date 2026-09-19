/**
 * 卡面中文文案（6F.5-fix2）。
 * 效果文案逐条摘自 docs/01_GAME_RULES.md §7.1「效果定义」表的「效果」列原文（去 markdown 加粗，转为纯文本）。
 * deck.ts 保持冻结，本文件只做展示层文案，不参与规则判定。
 * key 均为 cardId 冒号前的 base（如 'spy:3' -> 'spy'），与 getCardDisplayName 分词一致。
 */

/** 13 条 unique 效果文案：spy/mystic + 骗徒 6 + BA/shinobi + 反应 2 + 大将军 1 */
export const CARD_DESCRIPTION_ZH: Record<string, string> = {
  spy: '查看其身份牌',
  mystic: '查看其身份牌 + 随机一张其忍者牌；若目标仍有 2 张忍者牌，由施术者随机选 1 张看',
  shapeshifter: '查看二人身份牌，可秘密对调；对方不得再看新身份牌',
  grave_digger: '查看 2 张已弃忍者牌，选 1；可立即打出或面朝上留在自己面前后续使用',
  troublemaker: '查看其身份牌；可选择公开',
  spirit_merchant:
    '查看目标荣誉令牌或身份牌；可与之交换 1 枚令牌；可给对方任意己方 1 枚、取回任意对方 1 枚（看过或未看过均可）',
  thief: '亮出自己的身份牌；从枚数更多的玩家处拿走 1 枚令牌',
  judge: '亮出自己的身份牌；杀死该玩家；还施者与殉道者无效',
  blind_assassin: '直接杀死（不查看身份牌）',
  shinobi: '查看其身份牌，可选择杀死',
  mirror_monk: '被上忍或刺客选杀时翻开：反杀对方',
  martyr: '被上忍或刺客选杀时翻开：获得 1 枚荣誉令牌',
  mastermind: '夜晚结束后若仍存活则亮出：己方阵营本轮获胜；若为浪人则本轮无阵营获胜',
};

/**
 * 阶段中文名。key 同时覆盖：
 * - 13 个卡牌 base（tooltip 直接用 base 查，如 shapeshifter -> 骗徒）
 * - 7 个 CardPhase（spy/mystic/trickster/blind_assassin/shinobi/react/reveal）
 */
export const CARD_PHASE_ZH: Record<string, string> = {
  spy: '密探',
  mystic: '隐士',
  trickster: '骗徒',
  blind_assassin: '刺客',
  shinobi: '上忍',
  react: '反应',
  reveal: '揭示',
  shapeshifter: '骗徒',
  grave_digger: '骗徒',
  troublemaker: '骗徒',
  spirit_merchant: '骗徒',
  thief: '骗徒',
  judge: '骗徒',
  mirror_monk: '反应',
  martyr: '反应',
  mastermind: '揭示',
};
