(() => {
  'use strict';

  const state = { all: [], visible: [], search: '', category: 'all', openId: null };
  const audioPlayer = new Audio();
  const pageTier = document.body.dataset.tier || 'B2';
  const listEl = document.querySelector('[data-verbs-list]');
  const searchEl = document.querySelector('[data-verb-search]');
  const filterEls = [...document.querySelectorAll('[data-filter]')];

  const normalize = (value = '') => value.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const escapeHtml = (value = '') => value.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const eligibleForPage = (verb) => pageTier === 'C1-C2' ? ['B2', 'C1-C2'].includes(verb.tier) : verb.tier === 'B2';
  const matchesCategory = (verb) => state.category === 'all' || (Array.isArray(verb.tags) ? verb.tags.map(normalize) : []).includes(normalize(state.category));
  const matchesSearch = (verb) => {
    if (!state.search) return true;
    const extrasText = (verb.extras || []).flatMap((block) => [block.title, block.text, ...(block.items || [])]).join(' ');
    return normalize([verb.verb, verb.past, verb.participle, verb.meaning, verb.example, extrasText].join(' ')).includes(state.search);
  };

  const renderExtraBlock = (block) => {
    const items = Array.isArray(block.items) && block.items.length ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
    const text = block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
    return `<section class="extra-block extra-${escapeHtml(block.type || 'generic')}"><h4>${escapeHtml(block.title || '')}</h4>${text}${items}</section>`;
  };

  const renderRow = (verb, index) => {
    const extras = Array.isArray(verb.extras) ? verb.extras.filter(Boolean) : [];
    const hasExtras = extras.length > 0;
    const expanded = hasExtras && state.openId === verb.id;
    const audioWord = verb.audio?.word || '';
    const audioExample = verb.audio?.example || '';
    return `<article class="advanced-verb ${expanded ? 'is-expanded' : ''}" data-verb-id="${escapeHtml(verb.id)}">
      <div class="advanced-row">
        <div class="verb-index">${index + 1}</div>
        <div class="verb-cell verb-main">${escapeHtml(verb.verb)}</div>
        <div class="verb-cell">${escapeHtml(verb.past || '—')}</div>
        <div class="verb-cell">${escapeHtml(verb.participle || '—')}</div>
        <div class="verb-cell audio-cell">
          <button class="audio-pill word-audio" data-audio="${escapeHtml(audioWord)}" ${audioWord ? '' : 'disabled'}>🔊 <span>Verbo</span></button>
          <button class="audio-pill example-audio" data-audio="${escapeHtml(audioExample)}" ${audioExample ? '' : 'disabled'}>🎧 <span>Frase</span></button>
        </div>
        <div class="verb-cell example-cell">${escapeHtml(verb.example || '')}</div>
        <div class="verb-cell meaning-cell">${escapeHtml(verb.meaning || '')}</div>
        <div class="verb-cell expand-cell">${hasExtras ? `<button class="expand-button" data-expand="${escapeHtml(verb.id)}" aria-expanded="${expanded}">${expanded ? '⌃' : '⌄'}</button>` : ''}</div>
      </div>
      ${expanded ? `<div class="extras-grid extras-${Math.min(extras.length, 4)}">${extras.slice(0, 4).map(renderExtraBlock).join('')}</div>` : ''}
    </article>`;
  };

  const render = () => {
    if (!listEl) return;
    listEl.innerHTML = state.visible.length ? state.visible.map(renderRow).join('') : '<div class="empty-state">Nenhum verbo encontrado</div>';
  };

  const applyFilters = () => {
    state.visible = state.all.filter(eligibleForPage).filter(matchesCategory).filter(matchesSearch).sort((a, b) => a.verb.localeCompare(b.verb, 'en'));
    render();
  };

  const playAudio = (path, button) => {
    if (!path) return;
    document.querySelectorAll('.audio-pill.is-playing').forEach((el) => el.classList.remove('is-playing'));
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = path;
    button.classList.add('is-playing');
    audioPlayer.play().catch(() => button.classList.remove('is-playing'));
  };

  audioPlayer.addEventListener('ended', () => document.querySelectorAll('.audio-pill.is-playing').forEach((el) => el.classList.remove('is-playing')));

  document.addEventListener('click', (event) => {
    const audioButton = event.target.closest('[data-audio]');
    if (audioButton && !audioButton.disabled) return playAudio(audioButton.dataset.audio, audioButton);
    const expandButton = event.target.closest('[data-expand]');
    if (expandButton) {
      const id = expandButton.dataset.expand;
      state.openId = state.openId === id ? null : id;
      render();
    }
  });

  searchEl?.addEventListener('input', (event) => { state.search = normalize(event.target.value); applyFilters(); });
  filterEls.forEach((button) => button.addEventListener('click', () => {
    state.category = button.dataset.filter || 'all';
    filterEls.forEach((el) => el.classList.toggle('is-active', el === button));
    applyFilters();
  }));

  fetch('data/verbs.json', { cache: 'no-store' })
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((payload) => { state.all = Array.isArray(payload) ? payload : (payload.verbs || []); applyFilters(); })
    .catch((error) => {
      console.error('Erro ao carregar a base de verbos:', error);
      if (listEl) listEl.innerHTML = '<div class="empty-state">Não foi possível carregar a lista</div>';
    });
})();
