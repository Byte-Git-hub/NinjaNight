import './ui/style.css';
import './ui/arena.css';
import './ui/gestures.css';
import './ui/help.css';
import { GameNet } from './net/client';
import { AppUI } from './ui/app';
import { setAssetBase } from './ui/assets';

// 6I：子路径部署（GitHub Pages /<repo>/）时静态资源走 base 前缀
setAssetBase(import.meta.env.BASE_URL ?? '/');

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const net = new GameNet();
  const ui = new AppUI(app, net);
  ui.mount();
  // 连接地址优先级：?server= 调试覆盖 > VITE_API_BASE_URL（Vercel 生产）> 同源（本地开发）
  const params = new URLSearchParams(location.search);
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '';
  const url = params.get('server') || (envBase !== '' ? envBase : location.origin);
  const roomCode = params.get('room') || (typeof localStorage !== 'undefined' ? localStorage.getItem('ninja-night:lastRoomCode') : null);
  const savedToken = roomCode && typeof localStorage !== 'undefined' ? localStorage.getItem(`ninja-night:seatToken:${roomCode}`) : null;
  net.connect(url, savedToken ?? undefined);
  ui.render();

  if (import.meta.env.DEV) {
    import('./dev/inspect').then(({ attachInspect }) => {
      attachInspect(ui);
    });
  }
}

export {};
