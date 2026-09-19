import type { BotPersonality, SocialTriggerKind } from './social-heuristic';

export interface SocialTemplate {
  text: string;
  triggers?: readonly SocialTriggerKind[];
  /** Only the bot's own cards/house are used for these local preferences. */
  preference?: 'attack' | 'defence' | 'alone' | 'fewAlive';
}

export const SOCIAL_TEMPLATES: Readonly<Record<BotPersonality, readonly SocialTemplate[]>> = {
  aggressive: [
    { text: '这轮我不会手软', triggers: ['roundStart'] },
    { text: '刚才那一下，记得很清楚', triggers: ['playerDied'] },
    { text: '看我做什么？心虚了？', triggers: ['selfViewed'] },
    { text: '换了位置也没用', triggers: ['selfSwapped'] },
    { text: '今晚就看他了', preference: 'attack' },
    { text: '这一刀，我记下了', triggers: ['playerDied', 'selfViewed', 'selfSwapped'] },
    { text: '别拦我，我要去找师父重练了', triggers: ['lastWords'] },
    { text: '来吧，看谁先眨眼', triggers: ['reactionOpened'] },
    { text: '马上揭晓，别急着跑', triggers: ['beforeHouseReveal'] },
    { text: '人不多了，该分个高下', preference: 'fewAlive' },
  ],
  cautious: [
    { text: '先观察一下', triggers: ['roundStart'] },
    { text: '先记着，别急着跟票', triggers: ['playerDied'] },
    { text: '刚才有人在看我吗？', triggers: ['selfViewed'] },
    { text: '位置变了，信息也要重算', triggers: ['selfSwapped'] },
    { text: '大家别急着下判断', preference: 'defence' },
    { text: '这一下值得再想想', triggers: ['playerDied', 'selfViewed', 'selfSwapped'] },
    { text: '我先退场，大家小心', triggers: ['lastWords'] },
    { text: '等反应结束再说', triggers: ['reactionOpened'] },
    { text: '等亮牌后再下结论', triggers: ['beforeHouseReveal'] },
    { text: '人少了，更要谨慎', preference: 'fewAlive' },
  ],
  deceptive: [
    { text: '这轮也许会有惊喜', triggers: ['roundStart'] },
    { text: '有人倒下，反而更好猜了', triggers: ['playerDied'] },
    { text: '看得这么仔细？', triggers: ['selfViewed'] },
    { text: '交换之后，谁还说得准呢', triggers: ['selfSwapped'] },
    { text: '我建议大家再想想', preference: 'alone' },
    { text: '这未必是表面看到的', triggers: ['playerDied', 'selfViewed', 'selfSwapped'] },
    { text: '我倒下了，谜还没解开', triggers: ['lastWords'] },
    { text: '猜猜接下来会怎样', triggers: ['reactionOpened'] },
    { text: '答案也许和你想的不一样', triggers: ['beforeHouseReveal'] },
    { text: '最后几个人才最难猜', preference: 'fewAlive' },
  ],
};
