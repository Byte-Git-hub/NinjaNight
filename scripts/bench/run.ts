/**
 * 6J-1 性能基准：只记录数据，不设通过阈值。
 * 用法：npm run bench（后台跑，约 2 分钟）→ 输出 docs/06J_BENCH.md
 *
 * 三段：
 * A. core：11 人房（1 人 + 10 Bot）bot 全权驱动走完一局 ×3 种子：
 *    单轮耗时 / 服务端内存 / 事件吞吐。
 * B. 粒子池（node）：spawn + update 吞吐，存活峰值。
 * C. 浏览器 FX（headless chromium 软件渲染，数字仅供参考）：
 *    后端 :3000 + vite :5199 自起自停；10 连击砸物品的首帧延迟、
 *    30 秒平均 FPS、Canvas 粒子峰值（__ninjaFxPeak 探针）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { botDecide } from '../../src/core/bot';
import { applyAllDefaults, stateHash } from '../../src/core/engine';
import { projectView } from '../../src/core/project-view';
import { findSeat } from '../../src/core/utils';
import { ParticlePool } from '../../src/ui/effects/particles';
import { createLocalAdapter } from '../../src/dev/local-adapter';

function fmtByte(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// -- A. core 整局 -------------------------------------------------------------
function runFullGame(seed: number, players: number): {
  hash: string; totalMs: number; roundMs: number[]; events: number; rounds: number;
} {
  const a = createLocalAdapter({
    seed,
    playerCount: players,
    nicknames: Array.from({ length: players }, (_, i) => (i === 0 ? 'Human' : `Bot${i}`)),
  });
  const t0 = performance.now();
  const roundMs: number[] = [];
  let roundStart = t0;
  let lastRound = 1;
  let guard = 0;
  while (!a.getState().gameOver && guard < 2000) {
    guard += 1;
    const st = a.getState();
    if (st.round !== lastRound) {
      const now = performance.now();
      roundMs.push(now - roundStart);
      roundStart = now;
      lastRound = st.round;
    }
    if (st.pending.length === 0) {
      const r = applyAllDefaults(st);
      (a as unknown as { state: typeof st }).state = r.state;
      continue;
    }
    let progressed = false;
    for (const p of [...a.getState().pending]) {
      const cur = a.getState();
      const pp = cur.pending.find((x) => x.id === p.id);
      if (!pp) continue;
      const view = projectView(cur, pp.seatId);
      if (!view) continue;
      const cmd = botDecide(view, pp.id);
      if (!cmd) {
        const r = applyAllDefaults(cur);
        (a as unknown as { state: typeof cur }).state = r.state;
        progressed = true;
        break;
      }
      cmd.seatToken = findSeat(cur, pp.seatId)?.seatToken ?? '';
      cmd.commandId = `bench-${seed}-${guard}-${pp.id}`;
      a.submit(cmd);
      progressed = true;
    }
    if (!progressed) break;
  }
  const totalMs = performance.now() - t0;
  roundMs.push(performance.now() - roundStart);
  const end = a.getState();
  if (!end.gameOver) throw new Error(`seed=${seed} 未走完（guard 耗尽）`);
  return { hash: stateHash(end), totalMs, roundMs, events: end.events.length, rounds: end.round };
}

// -- B. 粒子池 -----------------------------------------------------------------
function benchPool(): { opsPerSec: number; peak: number; frameMs: number } {
  const pool = new ParticlePool();
  const t0 = performance.now();
  const N = 20000;
  for (let i = 0; i < N; i += 1) {
    pool.spawn({
      x: 100, y: 100, vx: 10, vy: -20, maxLife: 700,
      size: 3, color: '#fff', char: '', img: '', grav: 300,
    });
    if (pool.aliveCount >= pool.capacity) pool.clear();
  }
  const spawnMs = performance.now() - t0;
  let peak = 0;
  const f0 = performance.now();
  for (let f = 0; f < 120; f += 1) {
    if (pool.aliveCount < 150) {
      for (let k = 0; k < 20; k += 1) {
        pool.spawn({
          x: 100, y: 100, vx: 5, vy: -10, maxLife: 800,
          size: 3, color: '#fff', char: '', img: '', grav: 300,
        });
      }
    }
    peak = Math.max(peak, pool.update(16));
  }
  const frameMs = (performance.now() - f0) / 120;
  return { opsPerSec: Math.round((N / spawnMs) * 1000), peak, frameMs };
}

// -- C. 浏览器 FX --------------------------------------------------------------
function waitUrl(url: string, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((r) => {
          if (r.ok) resolve();
          else if (Date.now() - t0 > timeoutMs) reject(new Error(`timeout ${url}`));
          else setTimeout(tick, 200);
        })
        .catch(() => {
          if (Date.now() - t0 > timeoutMs) reject(new Error(`timeout ${url}`));
          else setTimeout(tick, 200);
        });
    };
    tick();
  });
}

async function benchBrowser(): Promise<{
  firstFrameMs: number; fps30: number; peak: number; bursts: number;
}> {
  const { chromium } = await import('@playwright/test');
  const backend: ChildProcess = spawn('node', ['--import', 'tsx', 'scripts/dev-server.ts'], {
    env: { ...process.env, PORT: '3000', BOT_DELAY_MS: '10', BOT_JITTER_MS: '0' },
    stdio: 'ignore',
  });
  const front: ChildProcess = spawn(
    'node',
    ['node_modules/vite/bin/vite.js', '--port', '5199', '--strictPort', '--host', '127.0.0.1'],
    { env: process.env, stdio: 'ignore' },
  );
  try {
    await waitUrl('http://127.0.0.1:3000/health', 30000);
    await waitUrl('http://127.0.0.1:5199/', 30000);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      await page.goto('http://127.0.0.1:5199/');
      await page.fill('#nick', '基准');
      await page.click('#btn-create');
      await page.locator('.room').waitFor();
      for (let i = 0; i < 3; i += 1) {
        await page.click('#btn-add-bot');
      }
      await page.locator(".seats li:has-text('🤖')").first().waitFor();
      await page.click('#btn-start');
      await page.locator('.phase').waitFor({ timeout: 15000 });
      await page.locator('.identity-modal').click({ timeout: 5000 }).catch(() => {});
      await page.locator('.fx-bar').waitFor({ timeout: 15000 });
      const botCard = page.locator('.seat-card.bot').first();
      await botCard.locator('.seat-head').click();
      // 10 连击：快速连点同一物品
      const t0 = Date.now();
      for (let i = 0; i < 10; i += 1) {
        await page.locator('[data-fx="egg"]').click();
      }
      await botCard.and(page.locator('.fx-hit')).first().waitFor({ timeout: 10000 }).catch(() => {});
      const firstFrameMs = Date.now() - t0;
      // 30 秒 FPS 采样（每秒一次，进度可见；字符串形式避开 tsx 转译 helper）
      await page.evaluate(`(() => {
        const w = window;
        w.__benchFrames = 0;
        const loop = () => { w.__benchFrames += 1; requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      })()`);
      let frames0 = 0;
      let fpsSum = 0;
      for (let s = 0; s < 30; s += 1) {
        await page.waitForTimeout(1000);
        const f = (await page.evaluate(`window.__benchFrames || 0`)) as number;
        fpsSum += f - frames0;
        frames0 = f;
        if ((s + 1) % 10 === 0) console.log(`[bench] fps sample ${s + 1}/30`);
      }
      const peak = (await page.evaluate(`window.__ninjaFxPeak || 0`)) as number;
      const bursts = (await page.evaluate(`window.__ninjaFxBursts || 0`)) as number;
      return { firstFrameMs, fps30: Math.round((fpsSum / 30) * 10) / 10, peak, bursts };
    } finally {
      await browser.close();
    }
  } finally {
    backend.kill();
    front.kill();
  }
}

async function main(): Promise<void> {
  const mem0 = process.memoryUsage();
  const seeds = [42, 7, 99];
  const games = seeds.map((s) => ({ seed: s, ...runFullGame(s, 11) }));
  const mem1 = process.memoryUsage();
  const pool = benchPool();
  console.log('[bench] core + pool done, starting browser…');
  const fx = await benchBrowser();
  console.log('[bench] browser done, writing docs/06J_BENCH.md');

  const md = `# 06J 性能基准（6J-1，只记录不设阈值）

生成时间：${new Date().toISOString()} ｜ headless chromium（软件渲染，真机 GPU 更高）

## A. 11 人房整局（1 人 + 10 Bot，bot 全权驱动）

| seed | 轮数 | 总耗时 | 事件数 | 事件吞吐 | 终局哈希 |
|---|---|---|---|---|---|
${games.map((g) => `| ${g.seed} | ${g.rounds} | ${g.totalMs.toFixed(0)} ms | ${g.events} | ${(g.events / (g.totalMs / 1000)).toFixed(0)} ev/s | \`${g.hash}\` |`).join('\n')}

单轮耗时（ms，seed=42）：${games[0]?.roundMs.map((m) => m.toFixed(0)).join(' / ') ?? '-'}

服务端内存（bench 进程常驻，整局前后）：heap
${fmtByte(mem0.heapUsed)} → ${fmtByte(mem1.heapUsed)}（rss ${fmtByte(mem0.rss)} → ${fmtByte(mem1.rss)}）

## B. 粒子池（node，200 上限）

| 指标 | 数值 |
|---|---|
| spawn 吞吐 | ${pool.opsPerSec} ops/s |
| 120 帧 update 平均 | ${pool.frameMs.toFixed(3)} ms/frame |
| 存活峰值 | ${pool.peak} |

## C. 浏览器 10 连击（headless，软件渲染）

| 指标 | 数值 |
|---|---|
| 首帧延迟（10 连点 → fx-hit 回声） | ${fx.firstFrameMs} ms |
| 30 秒平均 FPS | ${fx.fps30} |
| Canvas 粒子峰值（__ninjaFxPeak） | ${fx.peak} |
| 累计 burst | ${fx.bursts} |
`;
  writeFileSync('docs/06J_BENCH.md', md);
  console.log('[bench] done');
}

main().catch((e) => {
  console.error('[bench] FAILED', e);
  process.exit(1);
});
