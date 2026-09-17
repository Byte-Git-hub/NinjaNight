import './ui/style.css';
import { GameNet } from './net/client';
import { AppUI } from './ui/app';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const net = new GameNet();
  const ui = new AppUI(app, net);
  ui.mount();
  // 开发默认连同源；可用 ?server= 覆盖
  const params = new URLSearchParams(location.search);
  const url = params.get('server') || location.origin;
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
