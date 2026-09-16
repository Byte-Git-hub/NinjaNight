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
  net.connect(url);
  ui.render();
}

export {};
