(() => {
  'use strict';

  const body = document.body;
  const loader = document.querySelector('[data-site-loader]');
  const list = document.querySelector('[data-verbs-list]');
  if (!body || !loader || !list) return;

  let relationsReady = document.documentElement.dataset.multiwordReady === 'true';
  let revealed = false;

  const contentReady = () => Boolean(list.querySelector('.advanced-verb, .empty-state'));

  const reveal = (force = false) => {
    if (revealed) return;
    if (!contentReady()) return;
    if (!relationsReady && !force) return;

    revealed = true;
    body.classList.remove('is-loading');
    body.classList.add('is-ready');
    loader.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => loader.remove(), 460);
  };

  document.addEventListener('advanced-relations-ready', () => {
    relationsReady = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => reveal());
    });
  });

  const observer = new MutationObserver(() => {
    if (relationsReady) window.requestAnimationFrame(() => reveal());
  });
  observer.observe(list, { childList: true });

  window.addEventListener('load', () => {
    if (relationsReady) window.requestAnimationFrame(() => reveal());
  });

  // Se a camada de relações falhar, a lista principal ou a mensagem de erro ainda deve ficar utilizável
  window.setTimeout(() => reveal(true), 5000);
})();
