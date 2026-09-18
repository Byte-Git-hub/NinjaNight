/** 卡牌说明挂在页面顶层，避免被单屏牌桌的裁切和层叠容器遮挡。 */
export function mountCardTooltip(root: HTMLElement): () => void {
  const tip = document.createElement('div');
  tip.id = 'card-tooltip';
  tip.className = 'card-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let active: HTMLElement | null = null;
  const hide = () => {
    if (active) {
      const ids = (active.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tip.id);
      if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
      else active.removeAttribute('aria-describedby');
    }
    active = null;
    tip.hidden = true;
  };
  const show = (event: Event) => {
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.card[data-tip]') : null;
    if (!card || card === active) return;
    hide();
    active = card;
    tip.textContent = card.dataset['tip'] ?? '';
    tip.hidden = false;
    card.setAttribute('aria-describedby', `${card.getAttribute('aria-describedby') ?? ''} ${tip.id}`.trim());
    const rect = card.getBoundingClientRect();
    const width = tip.offsetWidth, height = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + (rect.width - width) / 2))}px`;
    const top = rect.top >= height + 16 ? rect.top - height - 10 : rect.bottom + 10;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, top))}px`;
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('focusin', show);
  const leave = (event: MouseEvent | FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !active?.contains(event.relatedTarget)) hide();
  };
  root.addEventListener('pointerout', leave);
  root.addEventListener('focusout', leave);
  root.addEventListener('pointerdown', hide);
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  return hide;
}
