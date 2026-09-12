(() => {
  'use strict';

  const body = document.body;
  const loader = document.querySelector('[data-site-loader]');
  const list = document.querySelector('[data-verbs-list]');
  if (!body || !loader || !list) return;

  let relationsReady = document.documentElement.dataset.multiwordReady === 'true';
  let fallbackExpired = false;
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
    window.requestAnimationFrame(() => reveal(fallbackExpired));
  });
  observer.observe(list, { childList: true });

  window.addEventListener('load', () => {
    window.requestAnimationFrame(() => reveal(fallbackExpired));
  });

  // Depois de 5 s, corpus ou mensagem de erro podem aparecer mesmo que a camada de relações falhe ou ainda não esteja pronta
  window.setTimeout(() => {
    fallbackExpired = true;
    reveal(true);
  }, 5000);
})();
