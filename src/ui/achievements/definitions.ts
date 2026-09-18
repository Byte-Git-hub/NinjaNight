/** 6H-3 成就定义（8 个，纯数据）。 */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-kill', name: '初次见血', desc: '完成首次击杀' },
  { id: 'eye-spy', name: '眼睛', desc: '一局内查看 3 个不同玩家' },
  { id: 'hermit', name: '隐者', desc: '一局内没出任何牌并活到最后' },
  { id: 'double-kill', name: '双重刺客', desc: '用上忍/刺客一局内成功击杀 2 人' },
  { id: 'target-dummy', name: '众矢之的', desc: '一局内被砸 5 次以上' },
  { id: 'rich', name: '富贵险中求', desc: '单局获得 10 分以上' },
  { id: 'first-win', name: '初胜', desc: '首次获胜' },
  { id: 'master', name: '忍界宗师', desc: '累计获胜 10 局' },
];

export function achievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
