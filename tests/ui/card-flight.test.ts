import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CardFlightLayer, initCardFlightLayer } from '../../src/ui/animations/card-flight';

describe('P2: 发牌与传牌飞行卡牌动画 CardFlightLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    
  });

  it('initCardFlightLayer 正常创建并挂载', () => {
    const root = {} as HTMLElement;
    const layer = initCardFlightLayer(root);
    expect(layer).toBeInstanceOf(CardFlightLayer);
  });

  it('playDealAnimation 空座位数组立即完成', async () => {
    const layer = new CardFlightLayer();
    const promise = layer.playDealAnimation([]);
    await expect(promise).resolves.toBeUndefined();
  });

  it('prefers-reduced-motion 开启时立即完成不播放动画', async () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
      }),
    });
    const layer = new CardFlightLayer();
    const root = {
      querySelector: vi.fn(),
    } as unknown as HTMLElement;
    layer.mount(root);
    const promise = layer.playDealAnimation(['s1', 's2']);
    await expect(promise).resolves.toBeUndefined();
  });
});
