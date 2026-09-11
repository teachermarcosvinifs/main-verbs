(() => {
  'use strict';

  const state = {
    all: [],
    filtered: [],
    search: '',
    filter: 'all',
    openId: null,
    audioBase: 'audio/advanced',
  };

  const pageTier = document.body.dataset.tier || 'B2';
  const listEl = document.querySelector('[data-verbs-list]');
  const searchEl = document.querySelector('[data-verb-search]');
  const jumpFormEl = document.querySelector('[data-jump-form]');
  const jumpEl = document.querySelector('[data-verb-jump]');
  const jumpListEl = document.querySelector('[data-verb-options]');
  const filterEls = [...document.querySelectorAll('[data-filter]')];
  const resultsCountEl = document.querySelector('[data-results-count]');
  const totalCountEl = document.querySelector('[data-total-count]');
  const extraCountEl = document.querySelector('[data-extra-count]');
  const pageSummaryEl = document.querySelector('[data-page-summary]');

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

  const slugify = (value = '') => normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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

  const visibleExtras = (verb) => (Array.isArray(verb.extras) ? verb.extras : [])
    .filter(Boolean)
    .filter((block) => block.type !== 'register')
    .slice(0, 4);

  const isIrregular = (verb) => {
    const type = normalize(verb.verbType);
    return type === 'irregular' || type === 'special';
  };

  const matchesFilter = (verb) => {
    switch (state.filter) {
      case 'tier-b2': return verb.tier === 'B2';
      case 'tier-c1': return verb.tier === 'C1-C2';
      case 'irregular': return isIrregular(verb);
      case 'extras': return visibleExtras(verb).length > 0;
      default: return true;
    }
  };

  const matchesSearch = (verb) => {
    if (!state.search) return true;
    const extrasText = visibleExtras(verb)
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

  const renderRow = (verb, index) => {
    const verbId = verb.id || `${verb.tier}-${verb.verb}`;
    const extras = visibleExtras(verb);
    const hasExtras = extras.length > 0;
    const expanded = hasExtras && state.openId === verbId;
    const audioWord = verb.audio?.word || `${state.audioBase}/word/${verb.verb}-word.wav`;
    const audioExample = verb.audio?.example || `${state.audioBase}/example/${verb.verb}-example.wav`;
    const anchorId = `verb-${slugify(verb.verb)}`;

    return `
      <article class="advanced-verb ${expanded ? 'is-expanded' : ''}" id="${anchorId}" data-verb-id="${escapeHtml(verbId)}" data-verb-name="${escapeHtml(verb.verb)}">
        <div class="advanced-row">
          <div class="verb-index">${index + 1}</div>
          <div class="verb-cell verb-main" data-label="Verbo">${escapeHtml(verb.verb)}</div>
          <div class="verb-cell form-cell" data-label="Passado">${escapeHtml(verb.past || '—')}</div>
          <div class="verb-cell form-cell" data-label="Particípio">${escapeHtml(verb.participle || '—')}</div>
          <div class="verb-cell audio-cell" data-label="Ouvir">
            <button class="audio-pill word-audio" data-audio="${escapeHtml(audioWord)}" aria-label="Ouvir verbo ${escapeHtml(verb.verb)}"><span aria-hidden="true">🔊</span><span>Verbo</span></button>
            <button class="audio-pill example-audio" data-audio="${escapeHtml(audioExample)}" aria-label="Ouvir frase de ${escapeHtml(verb.verb)}"><span aria-hidden="true">🎧</span><span>Frase</span></button>
          </div>
          <div class="verb-cell example-cell" data-label="Exemplo">${escapeHtml(verb.example || '')}</div>
          <div class="verb-cell meaning-cell" data-label="Significado">${escapeHtml(verb.meaning || '—')}</div>
          <div class="verb-cell expand-cell">
            ${hasExtras ? `<button class="expand-button" data-expand="${escapeHtml(verbId)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Fechar' : 'Abrir'} informações extras sobre ${escapeHtml(verb.verb)}">${expanded ? '⌃' : '⌄'}</button>` : ''}
          </div>
        </div>
        ${expanded ? `<div class="extras-grid extras-${extras.length}">${extras.map(renderExtraBlock).join('')}</div>` : ''}
      </article>
    `;
  };

  const render = () => {
    if (!listEl) return;
    listEl.innerHTML = state.filtered.length
      ? state.filtered.map(renderRow).join('')
      : '<div class="empty-state"><strong>Nenhum verbo encontrado</strong><span>Tente outra busca ou filtro</span></div>';

    if (resultsCountEl) resultsCountEl.textContent = state.filtered.length.toString();
    if (pageSummaryEl) {
      pageSummaryEl.textContent = state.filtered.length === 1
        ? '1 verbo nesta página'
        : `${state.filtered.length} verbos nesta página`;
    }
  };

  const applyFilters = () => {
    state.filtered = state.all
      .filter(eligibleForPage)
      .filter(matchesFilter)
      .filter(matchesSearch)
      .sort((a, b) => a.verb.localeCompare(b.verb, 'en'));
    state.openId = null;
    render();
  };

  const updateHeroCounts = () => {
    const eligible = state.all.filter(eligibleForPage);
    if (totalCountEl) totalCountEl.textContent = eligible.length.toString();
    if (extraCountEl) extraCountEl.textContent = eligible.filter((verb) => visibleExtras(verb).length > 0).length.toString();
  };

  const populateJumpOptions = () => {
    if (!jumpListEl) return;
    jumpListEl.innerHTML = state.all
      .filter(eligibleForPage)
      .sort((a, b) => a.verb.localeCompare(b.verb, 'en'))
      .map((verb) => `<option value="${escapeHtml(verb.verb)}"></option>`)
      .join('');
  };

  const resetForJump = () => {
    state.filter = 'all';
    state.search = '';
    if (searchEl) searchEl.value = '';
    filterEls.forEach((el) => el.classList.toggle('is-active', el.dataset.filter === 'all'));
    applyFilters();
  };

  const highlightTarget = (verb) => {
    const anchorId = `verb-${slugify(verb.verb)}`;
    const targetEl = document.getElementById(anchorId);
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.add('is-target');
    window.history.replaceState(null, '', `#${anchorId}`);
    window.setTimeout(() => targetEl.classList.remove('is-target'), 2200);
  };

  const goToVerb = (value) => {
    const wanted = normalize(value);
    if (!wanted) return;

    const eligible = state.all.filter(eligibleForPage);
    const target = eligible.find((verb) => normalize(verb.verb) === wanted)
      || eligible.find((verb) => normalize(verb.verb).startsWith(wanted));

    if (!target) {
      jumpEl?.classList.add('has-error');
      window.setTimeout(() => jumpEl?.classList.remove('has-error'), 1400);
      return;
    }

    if (jumpEl) jumpEl.value = target.verb;
    resetForJump();
    window.requestAnimationFrame(() => highlightTarget(target));
  };

  const stopAudio = () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    if (activeAudioButton) {
      activeAudioButton.classList.remove('is-playing');
      activeAudioButton = null;
    }
  };

  const playAudio = (path, button) => {
    if (!path) return;
    stopAudio();
    activeAudioButton = button;
    button.classList.remove('has-error');
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
    }
  });

  searchEl?.addEventListener('input', (event) => {
    state.search = normalize(event.target.value);
    applyFilters();
  });

  jumpFormEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    goToVerb(jumpEl?.value || '');
  });

  filterEls.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter || 'all';
      filterEls.forEach((el) => el.classList.toggle('is-active', el === button));
      applyFilters();
    });
  });

  const fetchJson = async (filePath) => {
    const response = await fetch(filePath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${filePath}: HTTP ${response.status}`);
    return response.json();
  };

  const loadCorpus = async () => {
    const manifest = await fetchJson('data/verbs.json');
    state.audioBase = manifest.audioBase || 'audio/advanced';

    if (Array.isArray(manifest)) return manifest;
    if (Array.isArray(manifest.verbs)) return manifest.verbs;
    if (!Array.isArray(manifest.chunks) || !manifest.chunks.length) {
      throw new Error('Manifesto de verbos sem chunks');
    }

    const chunks = await Promise.all(manifest.chunks.map(fetchJson));
    let verbs = chunks.flatMap((chunk) => Array.isArray(chunk) ? chunk : (chunk.verbs || []));
    const expected = manifest.counts?.cumulative;
    if (expected && verbs.length !== expected) throw new Error(`Base incompleta: ${verbs.length}/${expected}`);

    if (Array.isArray(manifest.extrasChunks) && manifest.extrasChunks.length) {
      const supplements = await Promise.all(manifest.extrasChunks.map(fetchJson));
      const extrasByVerb = Object.assign({}, ...supplements);
      verbs = verbs.map((verb) => Object.prototype.hasOwnProperty.call(extrasByVerb, verb.verb)
        ? { ...verb, extras: extrasByVerb[verb.verb] }
        : verb);
    }

    return verbs;
  };

  loadCorpus()
    .then((verbs) => {
      state.all = verbs;
      updateHeroCounts();
      populateJumpOptions();
      applyFilters();

      const hash = window.location.hash.replace('#verb-', '');
      if (hash) {
        const target = state.all.find((verb) => slugify(verb.verb) === hash && eligibleForPage(verb));
        if (target) window.setTimeout(() => highlightTarget(target), 120);
      }
    })
    .catch((error) => {
      console.error('Erro ao carregar a base de verbos:', error);
      if (listEl) listEl.innerHTML = '<div class="empty-state"><strong>Não foi possível carregar a lista</strong><span>Recarregue a página para tentar novamente</span></div>';
    });
})();