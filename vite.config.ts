import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

function cleanDistOriginals() {
  return {
    name: 'clean-dist-originals',
    closeBundle() {
      const distDir = path.resolve('dist');
      const walk = (d: string) => {
        if (!fs.existsSync(d)) return;
        for (const f of fs.readdirSync(d)) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) {
            if (f === '_originals') {
              fs.rmSync(p, { recursive: true, force: true });
            } else {
              walk(p);
            }
          }
        }
      };
      walk(distDir);
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [cleanDistOriginals()],
  // 6I：GitHub Pages 项目站路径为 /<repo-name>/，用 GITHUB_PAGES_BASE 注入；
  // 本地/Vercel 默认为 '/'。
  base: process.env.GITHUB_PAGES_BASE || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    // 局域网访问：监听所有网卡（本机 localhost 照常用，局域网用 http://<本机IP>:5173）
    host: '0.0.0.0',
    port: 5173,
    // 6G-1：NINJA_TLS=1 且 certs/ 齐全时跑 https（局域网麦克风必需），否则 http
    ...(loadLocalTls() ?? {}),
    proxy: {
      '/socket.io': {
        target: process.env.NINJA_TLS === '1' && tlsCertsExist() ? 'https://127.0.0.1:3000' : 'http://127.0.0.1:3000',
        ws: true,
        // 自签证书：开发代理跳过校验
        secure: false,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    passWithNoTests: true,
  },
});

/** 6G-1：certs/key.pem + certs/cert.pem 齐全即 true */
function tlsCertsExist(): boolean {
  return (
    fs.existsSync(path.resolve('certs/key.pem')) && fs.existsSync(path.resolve('certs/cert.pem'))
  );
}

/** 6G-1：NINJA_TLS=1 且证书齐全时返回 vite https 配置，否则 undefined（降级 http） */
function loadLocalTls(): { https: { key: Buffer; cert: Buffer } } | undefined {
  if (process.env.NINJA_TLS !== '1' || !tlsCertsExist()) return undefined;
  return {
    https: {
      key: fs.readFileSync(path.resolve('certs/key.pem')),
      cert: fs.readFileSync(path.resolve('certs/cert.pem')),
    },
  };
}
