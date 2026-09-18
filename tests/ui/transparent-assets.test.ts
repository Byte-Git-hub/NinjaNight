import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('transparent social sprites', () => {
  for (const [folder, count] of [['items', 9], ['emoji', 12]] as const) {
    it(`${folder} has ${count} genuine alpha cutouts with empty corners`, async () => {
      const dir = join(process.cwd(), 'public/assets', folder);
      const files = readdirSync(dir).filter(f => f.endsWith('.webp'));
      expect(files).toHaveLength(count);
      for (const file of files) {
        const { data, info } = await sharp(join(dir, file)).raw().toBuffer({ resolveWithObject:true });
        expect(info.channels, file).toBe(4);
        for (const pixel of [0, info.width - 1, info.width * (info.height - 1), info.width * info.height - 1]) expect(data[pixel * 4 + 3], file).toBeLessThanOrEqual(2);
        let transparent = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
        expect(transparent / (info.width * info.height), file).toBeGreaterThan(.35);
      }
    });
  }
});

