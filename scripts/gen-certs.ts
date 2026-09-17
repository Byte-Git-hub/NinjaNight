/**
 * 6G-1 自签证书生成脚本：`npm run certs`
 * 用法：npm run certs
 * 产物：certs/key.pem + certs/cert.pem（已 gitignore，不进版本控制）
 *
 * 优先调用系统 openssl；缺失则打印 mkcert/openssl 手动命令后退出码 1。
 * 证书 SAN 覆盖 localhost + 127.0.0.1，浏览器首次访问需信任一次。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'certs');
const keyPath = join(dir, 'key.pem');
const certPath = join(dir, 'cert.pem');

if (existsSync(keyPath) && existsSync(certPath)) {
  console.log('certs/ 已存在，跳过生成（删除后重跑可重新生成）。');
  process.exit(0);
}

mkdirSync(dir, { recursive: true });

// 某些发行版（miniforge）的 openssl 默认 cnf 路径不存在，
// 自带最小配置走 -config，不依赖系统 openssl.cnf。
const confPath = join(dir, 'openssl-req.cnf');
writeFileSync(
  confPath,
  [
    '[ req ]',
    'default_bits = 2048',
    'prompt = no',
    'default_md = sha256',
    'distinguished_name = dn',
    'x509_extensions = v3_req',
    '[ dn ]',
    'CN = localhost',
    '[ v3_req ]',
    'subjectAltName = @alt',
    '[ alt ]',
    'DNS.1 = localhost',
    'IP.1 = 127.0.0.1',
    '',
  ].join('\n'),
);

// 某些环境的 OPENSSL_CONF 指向不存在的路径，一并清除
const env: NodeJS.ProcessEnv = { ...process.env };
delete env.OPENSSL_CONF;

try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '825',
      '-nodes',
      '-config',
      confPath,
    ],
    { stdio: 'inherit', env },
  );
  console.log('自签证书已生成：certs/key.pem + certs/cert.pem');
  console.log('启动局域网 https：$env:NINJA_TLS=1; npm run dev:server（另起 vite dev 同样读 NINJA_TLS）');
} catch {
  console.error(
    [
      '未找到 openssl，无法自动生成。请二选一：',
      '  1) 安装 openssl 后重跑 npm run certs',
      '  2) mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1',
    ].join('\n'),
  );
  process.exit(1);
}
