(() => {
  'use strict';

  const PAGE_SIZE = 16;
  const state = {
    all: [],
    filtered: [],
    search: '',
    filter: 'all',
    page: 1,
    openId: null,
  };

  const pageTier = document.body.dataset.tier || 'B2';
  const listEl = document.querySelector('[data-verbs-list]');
  const searchEl = document.querySelector('[data-verb-search]');
  const filterEls = [...document.querySelectorAll('[data-filter]')];
  const resultsCountEl = document.querySelector('[data-results-count]');
  const totalCountEl = document.querySelector('[data-total-count]');
  const extraCountEl = document.querySelector('[data-extra-count]');
  const pageSummaryEl = document.querySelector('[data-page-summary]');
  const paginationEl = document.querySelector('[data-pagination]');

  const audioPlayer = new Audio();
  let activeAudioButton = null;

  const normalize = (value = '') => value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const escapeHtml = (value = '') => value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const qaApproved = (verb) => {
    const qa = verb.qa || {};
    if (verb.approved === true) return true;
    return qa.status === 'approved'
      && qa.patternChecked === true
      && qa.naturalnessChecked === true
      && qa.antiAiChecked === true
      && Array.isArray(qa.evidence)
      && qa.evidence.length > 0;
  };

  const eligibleForPage = (verb) => {
    if (!qaApproved(verb)) return false;
    if (pageTier === 'C1-C2') return verb.tier === 'B2' || verb.tier === 'C1-C2';
    return verb.tier === 'B2';
  };

  const isIrregular = (verb) => verb.verbType === 'irregular' || verb.verbType === 'special';

  const matchesFilter = (verb) => {
    switch (state.filter) {
      case 'tier-b2':
        return verb.tier === 'B2';
      case 'tier-c1':
        return verb.tier === 'C1-C2';
      case 'irregular':
        return isIrregular(verb);
      case 'extras':
        return Array.isArray(verb.extras) && verb.extras.length > 0;
      default:
        return true;
    }
  };

  const matchesSearch = (verb) => {
    if (!state.search) return true;

    const extrasText = (verb.extras || [])
      .flatMap((block) => [block.title, block.text, ...(block.items || [])])
      .join(' ');

    const haystack = normalize([
      verb.verb,
      verb.past,
      verb.participle,
      verb.meaning,
      verb.example,
      extrasText,
    ].join(' '));

    return haystack.includes(state.search);
  };

  const renderExtraBlock = (block) => {
    const text = block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
    const items = Array.isArray(block.items) && block.items.length
      ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';

    return `
      <section class="extra-block extra-${escapeHtml(block.type || 'generic')}">
        <h4>${escapeHtml(block.title || '')}</h4>
        ${text}
        ${items}
      </section>
    `;
  };

  const renderRow = (verb, indexOnPage) => {
    const absoluteIndex = ((state.page - 1) * PAGE_SIZE) + indexOnPage + 1;
    const verbId = verb.id || `${verb.tier}-${verb.verb}`;
    const extras = Array.isArray(verb.extras) ? verb.extras.filter(Boolean).slice(0, 4) : [];
    const hasExtras = extras.length > 0;
    const expanded = hasExtras && state.openId === verbId;
    const audioWord = verb.audio?.word || `audio/advanced/word/${verb.verb}-word.wav`;
    const audioExample = verb.audio?.example || `audio/advanced/example/${verb.verb}-example.wav`;

    return `
      <article class="advanced-verb ${expanded ? 'is-expanded' : ''}" data-verb-id="${escapeHtml(verbId)}">
        <div class="advanced-row">
          <div class="verb-index">${absoluteIndex}</div>
          <div class="verb-cell verb-main" data-label="Verbo">${escapeHtml(verb.verb)}</div>
          <div class="verb-cell form-cell" data-label="Passado">${escapeHtml(verb.past || '—')}</div>
          <div class="verb-cell form-cell" data-label="Particípio">${escapeHtml(verb.participle || '—')}</div>
          <div class="verb-cell audio-cell" data-label="Ouvir">
            <button class="audio-pill word-audio" data-audio="${escapeHtml(audioWord)}" ${audioWord ? '' : 'disabled'} aria-label="Ouvir verbo ${escapeHtml(verb.verb)}">
              <span aria-hidden="true">🔊</span><span>Verbo</span>
            </button>
            <button class="audio-pill example-audio" data-audio="${escapeHtml(audioExample)}" ${audioExample ? '' : 'disabled'} aria-label="Ouvir frase de ${escapeHtml(verb.verb)}">
              <span aria-hidden="true">🎧</span><span>Frase</span>
            </button>
          </div>
          <div class="verb-cell example-cell" data-label="Exemplo">${escapeHtml(verb.example || '')}</div>
          <div class="verb-cell meaning-cell" data-label="Significado">${escapeHtml(verb.meaning || '—')}</div>
          <div class="verb-cell expand-cell">
            ${hasExtras ? `
              <button class="expand-button" data-expand="${escapeHtml(verbId)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Fechar' : 'Abrir'} informações extras sobre ${escapeHtml(verb.verb)}">
                ${expanded ? '⌃' : '⌄'}
              </button>
            ` : ''}
          </div>
        </div>
        ${expanded ? `
          <div class="extras-grid extras-${extras.length}">
            ${extras.map(renderExtraBlock).join('')}
          </div>
        ` : ''}
      </article>
    `;
  };

  const pageCount = () => Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));

  const getPageItems = () => {
    const start = (state.page - 1) * PAGE_SIZE;
    return state.filtered.slice(start, start + PAGE_SIZE);
  };

  const paginationTokens = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const tokens = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) tokens.push('…');
    for (let i = start; i <= end; i += 1) tokens.push(i);
    if (end < total - 1) tokens.push('…');
    tokens.push(total);

    return tokens;
  };

  const renderPagination = () => {
    if (!paginationEl) return;

    const total = pageCount();
    if (state.page > total) state.page = total;

    const buttons = paginationTokens(state.page, total)
      .map((token) => {
        if (token === '…') return '<span class="page-ellipsis">…</span>';
        const active = token === state.page;
        return `<button class="page-button ${active ? 'is-active' : ''}" data-page="${token}" ${active ? 'aria-current="page"' : ''}>${token}</button>`;
      })
      .join('');

    paginationEl.innerHTML = `
      <button class="page-button page-arrow" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${buttons}
      <button class="page-button page-arrow" data-page="${state.page + 1}" ${state.page >= total ? 'disabled' : ''} aria-label="Próxima página">›</button>
    `;
  };

  const render = () => {
    if (!listEl) return;

    const pageItems = getPageItems();

    if (!pageItems.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <strong>Nenhum verbo encontrado</strong>
          <span>Tente outra busca ou filtro</span>
        </div>
      `;
    } else {
      listEl.innerHTML = pageItems.map(renderRow).join('');
    }

    if (resultsCountEl) resultsCountEl.textContent = state.filtered.length.toString();

    const start = state.filtered.length ? ((state.page - 1) * PAGE_SIZE) + 1 : 0;
    const end = Math.min(state.page * PAGE_SIZE, state.filtered.length);
    if (pageSummaryEl) {
      pageSummaryEl.textContent = state.filtered.length
        ? `Mostrando ${start}–${end} de ${state.filtered.length}`
        : '0 verbos';
    }

    renderPagination();
  };

  const applyFilters = ({ resetPage = true } = {}) => {
    state.filtered = state.all
      .filter(eligibleForPage)
      .filter(matchesFilter)
      .filter(matchesSearch)
      .sort((a, b) => a.verb.localeCompare(b.verb, 'en'));

    if (resetPage) state.page = 1;
    state.openId = null;
    render();
  };

  const updateHeroCounts = () => {
    const eligible = state.all.filter(eligibleForPage);
    if (totalCountEl) totalCountEl.textContent = eligible.length.toString();
    if (extraCountEl) {
      extraCountEl.textContent = eligible.filter((verb) => Array.isArray(verb.extras) && verb.extras.length).length.toString();
    }
  };

  const stopAudio = () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;

    if (activeAudioButton) {
      activeAudioButton.classList.remove('is-playing', 'has-error');
      activeAudioButton = null;
    }
  };

  const playAudio = (path, button) => {
    if (!path) return;

    stopAudio();
    activeAudioButton = button;
    button.classList.add('is-playing');
    audioPlayer.src = path;
    audioPlayer.play().catch(() => {
      button.classList.remove('is-playing');
      button.classList.add('has-error');
      activeAudioButton = null;
    });
  };

  audioPlayer.addEventListener('ended', stopAudio);
  audioPlayer.addEventListener('error', () => {
    if (activeAudioButton) {
      activeAudioButton.classList.remove('is-playing');
      activeAudioButton.classList.add('has-error');
      activeAudioButton = null;
    }
  });

  document.addEventListener('click', (event) => {
    const audioButton = event.target.closest('[data-audio]');
    if (audioButton && !audioButton.disabled) {
      playAudio(audioButton.dataset.audio, audioButton);
      return;
    }

    const expandButton = event.target.closest('[data-expand]');
    if (expandButton) {
      const id = expandButton.dataset.expand;
      state.openId = state.openId === id ? null : id;
      render();
      return;
    }

    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      const nextPage = Number(pageButton.dataset.page);
      if (!Number.isNaN(nextPage) && nextPage >= 1 && nextPage <= pageCount()) {
        state.page = nextPage;
        state.openId = null;
        render();
        document.querySelector('.advanced-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  searchEl?.addEventListener('input', (event) => {
    state.search = normalize(event.target.value);
    applyFilters();
  });

  filterEls.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter || 'all';
      filterEls.forEach((el) => el.classList.toggle('is-active', el === button));
      applyFilters();
    });
  });

  fetch('data/verbs.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      state.all = Array.isArray(payload) ? payload : (payload.verbs || []);
      updateHeroCounts();
      applyFilters();
    })
    .catch((error) => {
      console.error('Erro ao carregar a base de verbos:', error);
      if (listEl) {
        listEl.innerHTML = `
          <div class="empty-state">
            <strong>Não foi possível carregar a lista</strong>
            <span>Recarregue a página para tentar novamente</span>
          </div>
        `;
      }
    });
})();
