(() => {
  'use strict';

  const body = document.body;
  const loader = document.querySelector('[data-site-loader]');
  const list = document.querySelector('[data-verbs-list]');
  const controls = document.querySelector('.advanced-controls');
  const alphabet = document.querySelector('[data-alphabet-index]');
  if (!body || !loader || !list) return;

  // Keep the search/filter bar and A–Z index in the same sticky flow.
  // Two independent sticky siblings can collide when the controls change height
  // (for example, when C1–C2 filters wrap). The wrapper makes the browser lay
  // them out vertically first and then sticks the whole stack as one unit.
  if (controls && alphabet && controls.parentElement === alphabet.parentElement) {
    const stickyStack = document.createElement('div');
    stickyStack.className = 'advanced-navigation-stack';
    controls.before(stickyStack);
    stickyStack.append(controls, alphabet);
  }

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
