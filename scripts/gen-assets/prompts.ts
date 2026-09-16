export interface VisualUnitPrompt {
  visualId: string;
  nameZh: string;
  nameEn: string;
  kind: 'ninja' | 'house' | 'ui';
  category: string;
  visualHint: string;
  promptZh: string;
  promptEn: string;
  negative: string;
}

export const BASE_STYLE_PREFIX =
  'Modern ukiyo-e character illustration as the main subject, ink wash painting (sumi-e) background depicting night atmosphere, with minimal neon accents or gold foil (kintsugi) highlights on key skill elements and faction crests. Palette: ink black and deep indigo for base, with restrained neon/gold accents. Top 12% and bottom 22% of the composition reserved as plain color margins for text overlay, no visual elements in those regions. Original artwork, not imitating any existing published illustration.';

export const STANDARD_NEGATIVE =
  'text, watermark, logo, typography, border, frame, extra limbs, low quality, blurry, deformed hands, signature, cropped';

/**
 * 视觉单元映射表（VISUAL_MAP）：visualId → 覆盖的实际牌 / 资源 ID 清单
 * 16 个卡牌视觉单元覆盖全部 44 张权威卡牌，另外 3 个 UI 单元对应界面槽位。
 */
export const VISUAL_MAP: Record<string, string[]> = {
  // 忍者牌（13 个视觉单元，覆盖 33 张牌）
  spy: ['spy-1', 'spy-2', 'spy-3', 'spy-4', 'spy-5', 'spy-6'],
  mystic: ['mystic-1', 'mystic-2', 'mystic-3', 'mystic-4', 'mystic-5', 'mystic-6'],
  shapeshifter: ['shapeshifter'],
  grave_digger: ['grave_digger'],
  troublemaker: ['troublemaker'],
  spirit_merchant: ['spirit_merchant'],
  thief: ['thief'],
  judge: ['judge'],
  blind_assassin: [
    'blind_assassin-1',
    'blind_assassin-2',
    'blind_assassin-3',
    'blind_assassin-4',
    'blind_assassin-5',
    'blind_assassin-6',
  ],
  shinobi: [
    'shinobi-1',
    'shinobi-2',
    'shinobi-3',
    'shinobi-4',
    'shinobi-5',
    'shinobi-6',
  ],
  mirror_monk: ['mirror_monk'],
  martyr: ['martyr'],
  mastermind: ['mastermind'],

  // 流派牌（3 个视觉单元，覆盖 11 张阵营牌）
  crane: ['crane-1', 'crane-2', 'crane-3', 'crane-4', 'crane-5'],
  lotus: ['lotus-1', 'lotus-2', 'lotus-3', 'lotus-4', 'lotus-5'],
  ronin: ['ronin'],

  // UI 素材（3 个视觉单元，预留槽位）
  'ui-lobby-bg': ['ui-lobby-bg'],
  'ui-table-texture': ['ui-table-texture'],
  'ui-button-primary': ['ui-button-primary'],
};

/**
 * 16 个卡牌视觉单元 + 3 条 UI 素材 prompt 清单
 */
export const VISUAL_PROMPTS: VisualUnitPrompt[] = [
  // ==========================================
  // 忍者牌视觉单元（13 项）
  // ==========================================
  {
    visualId: 'spy',
    nameZh: '密探',
    nameEn: 'Spy',
    kind: 'ninja',
    category: 'spy',
    visualHint: '暗处窥视、卷轴、眼睛（水墨夜色中一点金箔眼）',
    promptZh: '密探隐匿于竹帘阴影中，半展开绝密卷轴，水墨夜色中唯有一只眼睛闪烁着金色眼眸与金箔微光。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A hooded ninja spy crouching behind a dark bamboo lattice screen in an ink-wash night chamber, carefully unrolling an ancient silk scroll. One piercing eye gleams through a narrow gap with a bright gold foil (kintsugi) fleck iris, surrounded by deep sumi-e indigo shadows. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'mystic',
    nameZh: '隐士',
    nameEn: 'Mystic',
    kind: 'ninja',
    category: 'mystic',
    visualHint: '占卜、牌阵、月光',
    promptZh: '神秘隐士双掌微悬，三张泛着微光的占卜符牌在幽冷月光下环绕成弧形，水墨夜雾氤氲。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A mystical hermit diviner in flowing sumi-e robes, hands hovering over an ethereal crescent arc of three floating omen cards. Pale silver moonlight spills from an indigo sky, illuminating delicate gold-foil astrological glyphs on the cards. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'shapeshifter',
    nameZh: '百变者',
    nameEn: 'Shapeshifter',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '面具、镜像、双影',
    promptZh: '百变者手握能面半遮容颜，身侧是一面碎裂的青铜立镜，水墨夜色中映照出两道截然不同的异色身影。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: An elusive shapeshifter ninja holding a blank white Noh mask half-covering their face, positioned beside a tall fractured antique bronze mirror. The broken glass reflects a dual, shifting shadow figure in neon indigo and ink wash split silhouettes. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'grave_digger',
    nameZh: '掘墓人',
    nameEn: 'Grave Digger',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '掘土、枯骨、残牌',
    promptZh: '掘墓人跪于长满青苔的荒冢前，身旁铁铲掘开新土，枯骨与残破的古旧卡牌在昏暗油灯微光下重见天日。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A grim grave digger ninja kneeling in a forgotten mossy graveyard at night, an iron spade planted in dark churned earth. A small dim lantern illuminates weathered skeletal remains and unearthed antique torn playing cards with gold-foil cracks. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'troublemaker',
    nameZh: '捣蛋鬼',
    nameEn: 'Troublemaker',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '掀桌、喧哗、火把',
    promptZh: '捣蛋鬼在茶馆喧闹声中猛然掀翻木桌，茶盏与骰子凌空飞溅，手中挥舞着迸发火星的明亮火把，动感水墨四溢。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A chaotic troublemaker ninja violently overturning a heavy wooden tavern table in dynamic perspective. Flying cups, dice, and splattering black ink drops fill the air as the character swings a blazing ember-sparking torch with wild neon-red sparks. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'spirit_merchant',
    nameZh: '商人',
    nameEn: 'Spirit Merchant',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '天平、钱袋、讨价',
    promptZh: '行踪神秘的灵魂商人托起古铜小天平，托盘一侧放着金箔标记，另一侧悬着沉甸甸的锦囊钱袋，夜雾中讨价还价。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: An enigmatic spirit merchant in a dark bamboo conical hat holding up an ornate handheld brass balance scale. One pan weighs a kintsugi gold-foiled circular honor token, while the other balances an embroidered velvet coin purse in mystical misty darkness. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'thief',
    nameZh: '盗贼',
    nameEn: 'Thief',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '暗手、令牌、金袋',
    promptZh: '黑夜中伸出一只敏捷矫健的暗影之手，悄然从华丽锦缎腰带上抽走一枚金箔荣誉令牌，旁边系着沉重金袋。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A nimble phantom thief in midnight stealth gear, one gloved hand deftly slipping a glowing gold-foil circular honor token from an opponent's silk sash, clutching a heavy leather pouch in the other hand. Dramatic sumi-e smoke trails. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'judge',
    nameZh: '裁判',
    nameEn: 'Judge',
    kind: 'ninja',
    category: 'trickster',
    visualHint: '高举判词、火印、裁决',
    promptZh: '威严冷峻的审判官高举写满水墨誓词的裁决卷轴，一枚燃烧着烈火红光的朱红火印重重盖下，气势庄严。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: An imposing masked judge raising a grand scroll of solemn judicial decree high overhead with both hands, pressing down a fiery crimson flame seal stamp onto paper. Radiant vermilion embers and dramatic black ink splash composition. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'blind_assassin',
    nameZh: '刺客',
    nameEn: 'Blind Assassin',
    kind: 'ninja',
    category: 'blind_assassin',
    visualHint: '兜帽、双刀、阴影（不露眼）',
    promptZh: '冷酷刺客深垂兜帽完全遮蔽双眼，胸前十字交叉双柄短刀，静伏于无边水墨夜色阴影之中。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A lethal blind assassin shrouded in a deep cloth cowl completely veiling the upper face and eyes in impenetrable black shadow. Twin Japanese tanto daggers are held crossed tightly in front of the chest, edge gleaming with a faint cold blade highlight. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'shinobi',
    nameZh: '上忍',
    nameEn: 'Shinobi',
    kind: 'ninja',
    category: 'shinobi',
    visualHint: '屋顶、绳索、忍具（可露眼）',
    promptZh: '敏捷上忍疾驰于传统青瓦屋脊之上，手握收拢的飞爪绳索，锐利坚毅的双眼直视前方，夜风扬起额带。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: An elite shinobi ninja sprinting dynamically across curved traditional roof tiles at night. Holding a coiled grappling rope and iron hook, with determined, fiercely visible eyes gazing forward above a dark ninja face mask. Flying headband ribbons. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'mirror_monk',
    nameZh: '还施者',
    nameEn: 'Mirror Monk',
    kind: 'ninja',
    category: 'react',
    visualHint: '铜镜、回击、禅意',
    promptZh: '宝相庄严的禅僧手持八角铜镜，镜面泛起空灵涟漪反弹夜袭的墨刃杀气，神色慈悲淡泊，充满禅意。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A serene monk in dark indigo meditative robes holding a polished octagonal antique bronze mirror facing forward. The mirror surface ripples with a radiant zen reflection that deflects a shadowy strike with golden kintsugi shockwaves. Calm, tranquil expression. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'martyr',
    nameZh: '殉道者',
    nameEn: 'Martyr',
    kind: 'ninja',
    category: 'react',
    visualHint: '舍身、莲花、光',
    promptZh: '殉道者张开双臂以身迎向利刃，胸膛迸发出一朵由金箔与纯白流光构筑的圣洁莲花，夜空为之照亮。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A selfless martyr figure throwing open their arms to protectively absorb a mortal blow, eyes calm. From the center of the chest blooms a glowing, radiant sacred lotus flower made of kintsugi gold foil and pure white spiritual light against deep ink-wash dark. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'mastermind',
    nameZh: '大将军',
    nameEn: 'Mastermind',
    kind: 'ninja',
    category: 'reveal',
    visualHint: '高台、棋局、俯瞰',
    promptZh: '幕后主使大将军端坐于高阁楼台，面前是一局微缩木质将棋兵盘，手拈棋子，以全知冷峻的目光俯瞰整座城池战局。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: A grand strategist mastermind seated royally upon an elevated balcony pavilion, resting a hand over a wooden battle shogi board with miniature tactical markers. Cold commanding eyes overlooking a sprawling panoramic night battlefield below. Regal gold trim. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },

  // ==========================================
  // 流派牌视觉单元（3 项）
  // ==========================================
  {
    visualId: 'crane',
    nameZh: '仙鹤',
    nameEn: 'Crane',
    kind: 'house',
    category: 'house',
    visualHint: '仙鹤家纹、展翅丹顶、朱红与金箔',
    promptZh: '仙鹤阵营流派牌：展翅腾飞的优美丹顶白鹤，底色为浓重水墨夜色，仙鹤羽翼镶嵌纯金金箔，身披朱红绸缎饰带。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: House of Crane heraldic card. A majestic crowned crane spreading vast pristine wings, framed by swirling sumi-e night clouds. Accented with deep vermilion red silk ribbons and radiant kintsugi gold foil flecks on the plumage and royal seal. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'lotus',
    nameZh: '莲花',
    nameEn: 'Lotus',
    kind: 'house',
    category: 'house',
    visualHint: '莲花家纹、水月睡莲、青金与银白',
    promptZh: '莲花阵营流派牌：在深邃水墨夜池中盛开的青金玉莲，花瓣边缘点缀纯银色反光，水波荡漾。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: House of Lotus heraldic emblem card. A magnificent sacred water lily blooming in pristine symmetry, rendered in deep lapis lazuli blue with radiant silver-white edge highlights on dark ink-wash pond ripples. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'ronin',
    nameZh: '浪人',
    nameEn: 'Ronin',
    kind: 'house',
    category: 'house',
    visualHint: '斗笠、破旧和服、孤身独行、灰白无点缀',
    promptZh: '浪人阵营身份牌：无主独行浪人头戴斗笠、身着褴褛灰白和服，腰佩双刀孤身行走在凄凉夜雨泥泞中，纯粹水墨灰白，无任何金银彩色点缀。',
    promptEn: `${BASE_STYLE_PREFIX} Subject: Masterless Ronin identity card. A lone wandering swordsman in a weathered conical straw hat and ragged ash-grey and off-white kimono, walking down a desolate rainy muddy road. Stark, austere sumi-e ink black and grey washes only, completely devoid of gold or color accents. Lone wolf aura. Vertical 2:3 composition.`,
    negative: STANDARD_NEGATIVE,
  },

  // ==========================================
  // UI 视觉单元（3 项）
  // ==========================================
  {
    visualId: 'ui-lobby-bg',
    nameZh: '大厅背景底图',
    nameEn: 'Lobby Background Texture',
    kind: 'ui',
    category: 'ui',
    visualHint: '水墨夜色 + 远处灯笼，中央留空给房间列表',
    promptZh: '大厅主背景底图：幽深水墨夜色全景，远景处有点点温暖纸灯笼微光与朦胧山峦，画面中央保留大面积平缓暗色留白以便承载房间列表与面板。',
    promptEn: `Sumi-e ink wash landscape painting of a serene Japanese night, deep indigo and charcoal gradients. Distant traditional lanterns glow faintly with gentle warm amber light across mist-covered hills. Wide open generous negative space in the central region reserved for clean UI overlay. Minimalist atmospheric background texture, 16:9 ratio, no text.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'ui-table-texture',
    nameZh: '牌桌和纸底纹',
    nameEn: 'Table Paper Texture',
    kind: 'ui',
    category: 'ui',
    visualHint: '和纸质感 + 墨渍边缘，用作桌面底纹',
    promptZh: '对局桌面底纹：高分辨率平铺和纸纹理，边缘带有自然的古雅毛边与深色水墨晕染渐变，极简典雅。',
    promptEn: `Seamless authentic Japanese handcrafted washi paper texture, subtle natural off-white mulberry fibers visible. Soft vignette of diffused black and indigo sumi-e ink stains bleeding inwards along the outer borders, clean uncluttered center, top-down flat lay, warm ambient lighting, 16:9 ratio, no text.`,
    negative: STANDARD_NEGATIVE,
  },
  {
    visualId: 'ui-button-primary',
    nameZh: '主要按钮质感板',
    nameEn: 'Primary Button Texture',
    kind: 'ui',
    category: 'ui',
    visualHint: '霓虹描边 + 金箔底，用于主要按钮',
    promptZh: '主操作按钮材质纹理：深沉黑靛色大漆底板，边缘镶嵌纤细金箔裂纹（金缮风格）与极微弱的霓虹青蓝描边，扁平典雅。',
    promptEn: `A minimalist rectangular button surface plate texture, polished deep indigo lacquer base with fine kintsugi real gold foil fleck inlay along the beveled bevel edge and a subtle neon cyan inner stroke. Flat graphic design element for game UI, clean metallic sheen, no text.`,
    negative: STANDARD_NEGATIVE,
  },
];
