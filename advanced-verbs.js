(() => {
  'use strict';

  const FAVORITES_KEY = 'mainVerbsFavoritesV1';
  const PREPOSITIONS = ['about','against','among','around','at','between','by','for','from','in','into','of','on','over','through','to','toward','under','with','within','without'];
  const PREPOSITION_SET = new Set(PREPOSITIONS);

  const readFavorites = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  };

  const state = {
    all: [],
    filtered: [],
    search: '',
    filter: 'all',
    preposition: '',
    openIds: new Set(),
    favorites: readFavorites(),
    polysemy: {},
    secondaryExamples: {},
    audioBase: 'audio/advanced',
  };

  const pageTier = document.body.dataset.tier || 'B2';
  const listEl = document.querySelector('[data-verbs-list]');
  const searchEl = document.querySelector('[data-verb-search]');
  const jumpFormEl = document.querySelector('[data-jump-form]');
  const jumpEl = document.querySelector('[data-verb-jump]');
  const jumpListEl = document.querySelector('[data-verb-options]');
  const prepositionEl = document.querySelector('[data-preposition-filter]');
  const alphabetEl = document.querySelector('[data-alphabet-index]');
  const filterEls = [...document.querySelectorAll('[data-filter]')];
  const resultsCountEl = document.querySelector('[data-results-count]');
  const totalCountEl = document.querySelector('[data-total-count]');
  const pageSummaryEl = document.querySelector('[data-page-summary]');

  const audioPlayer = new Audio();
  let activeAudioButton = null;
  let knownVerbLookup = new Map();

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

  const verbIdFor = (verb) => verb.id || `${verb.tier}-${verb.verb}`;

  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = prev[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
        diagonal = old;
      }
    }
    return prev[b.length];
  };

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

  const extractPrepositions = (verb) => {
    const block = visibleExtras(verb).find((item) => item.type === 'prepositions');
    if (!block) return [];
    const content = [block.text, ...(block.items || [])].filter(Boolean).join(' ');
    const tokens = normalize(content).split(/[^a-z]+/).filter(Boolean);
    return [...new Set(tokens.filter((token) => PREPOSITION_SET.has(token)))];
  };

  const isIrregular = (verb) => {
    const type = normalize(verb.verbType);
    return type === 'irregular' || type === 'special';
  };

  const matchesFilter = (verb) => {
    switch (state.filter) {
      case 'tier-b2': return verb.tier === 'B2';
      case 'tier-c1': return verb.tier === 'C1-C2';
      case 'irregular': return isIrregular(verb);
      case 'favorites': return state.favorites.has(verb.verb);
      default: return true;
    }
  };

  const matchesPreposition = (verb) => !state.preposition || extractPrepositions(verb).includes(state.preposition);

  const matchesSearch = (verb) => {
    if (!state.search) return true;
    const extrasText = visibleExtras(verb)
      .flatMap((block) => [block.title, block.text, ...(block.items || [])])
      .join(' ');
    const polysemyText = (state.polysemy[verb.verb] || [])
      .flatMap((item) => [item.label, item.pattern, ...(item.examples || [])])
      .join(' ');
    const secondary = state.secondaryExamples[verb.verb];
    const haystack = normalize([
      verb.verb,
      verb.past,
      verb.participle,
      verb.meaning,
      verb.example,
      extrasText,
      polysemyText,
      secondary?.pattern,
      secondary?.example,
    ].filter(Boolean).join(' '));

    if (haystack.includes(state.search)) return true;
    if (state.search.includes(' ') || state.search.length < 4) return false;
    const distance = levenshtein(normalize(verb.verb), state.search);
    const threshold = state.search.length <= 5 ? 1 : 2;
    return distance <= threshold;
  };

  const renderContrastItem = (item) => {
    const match = String(item).match(/^([A-Za-z]+)(\b.*)$/);
    if (!match) return escapeHtml(item);
    const candidate = normalize(match[1]);
    if (!knownVerbLookup.has(candidate)) return escapeHtml(item);
    return `<button class="inline-verb-link" type="button" data-go-verb="${escapeHtml(match[1])}" title="Ir para ${escapeHtml(match[1])}">${escapeHtml(match[1])}</button>${escapeHtml(match[2])}`;
  };

  const renderExtraBlock = (block) => {
    const text = block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
    const items = Array.isArray(block.items) && block.items.length
      ? `<ul>${block.items.map((item) => `<li>${block.type === 'contrast' ? renderContrastItem(item) : escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    return `
      <section class="extra-block extra-${escapeHtml(block.type || 'generic')}">
        <h4>${escapeHtml(block.title || '')}</h4>
        ${text}
        ${items}
      </section>
    `;
  };

  const renderPolysemy = (verb) => {
    const uses = state.polysemy[verb.verb] || [];
    if (!uses.length) return '';
    return `
      <section class="polysemy-panel">
        <div class="special-panel-title"><span>Usos principais</span><small>${uses.length} sentidos frequentes</small></div>
        <div class="polysemy-grid">
          ${uses.map((use) => `
            <div class="polysemy-use">
              <strong>${escapeHtml(use.label)}</strong>
              <code>${escapeHtml(use.pattern)}</code>
              <span>${(use.examples || []).map(escapeHtml).join(' · ')}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  };

  const renderSecondaryExample = (verb) => {
    const item = state.secondaryExamples[verb.verb];
    if (!item) return '';
    return `
      <section class="secondary-example-panel">
        <div>
          <span class="secondary-kicker">Outro padrão</span>
          <strong>${escapeHtml(item.pattern)}</strong>
        </div>
        <p>${escapeHtml(item.example)}</p>
      </section>
    `;
  };

  const renderRow = (verb, index) => {
    const verbId = verbIdFor(verb);
    const extras = visibleExtras(verb);
    const polysemy = state.polysemy[verb.verb] || [];
    const secondary = state.secondaryExamples[verb.verb];
    const hasExtras = extras.length > 0 || polysemy.length > 0 || secondary;
    const expanded = hasExtras && state.openIds.has(verbId);
    const audioWord = verb.audio?.word || `${state.audioBase}/word/${verb.verb}-word.wav`;
    const audioExample = verb.audio?.example || `${state.audioBase}/example/${verb.verb}-example.wav`;
    const anchorId = `verb-${slugify(verb.verb)}`;
    const favorite = state.favorites.has(verb.verb);

    return `
      <article class="advanced-verb ${expanded ? 'is-expanded' : ''}" id="${anchorId}" data-verb-id="${escapeHtml(verbId)}" data-verb-name="${escapeHtml(verb.verb)}">
        <div class="advanced-row">
          <div class="verb-index">${index + 1}</div>
          <div class="verb-cell verb-main" data-label="Verbo">
            <div class="verb-title-line">
              <span>${escapeHtml(verb.verb)}</span>
              <button class="favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-favorite="${escapeHtml(verb.verb)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Remover' : 'Adicionar'} ${escapeHtml(verb.verb)} ${favorite ? 'dos' : 'aos'} meus verbos"><span aria-hidden="true">${favorite ? '★' : '☆'}</span></button>
            </div>
          </div>
          <div class="verb-cell form-cell past-cell" data-label="Passado"><span class="form-value past-form">${escapeHtml(verb.past || '—')}</span></div>
          <div class="verb-cell form-cell participle-cell" data-label="Particípio"><span class="form-value participle-form">${escapeHtml(verb.participle || '—')}</span></div>
          <div class="verb-cell audio-cell" data-label="Ouvir">
            <button class="audio-pill word-audio" data-audio="${escapeHtml(audioWord)}" aria-label="Ouvir verbo ${escapeHtml(verb.verb)}"><span aria-hidden="true">🔊</span><span>Verbo</span></button>
            <button class="audio-pill example-audio" data-audio="${escapeHtml(audioExample)}" aria-label="Ouvir frase de ${escapeHtml(verb.verb)}"><span aria-hidden="true">🎧</span><span>Frase</span></button>
          </div>
          <div class="verb-cell example-cell" data-label="Exemplo">${escapeHtml(verb.example || '')}</div>
          <div class="verb-cell meaning-cell" data-label="Significado">${escapeHtml(verb.meaning || '—')}</div>
          <div class="verb-cell expand-cell">
            ${hasExtras ? `<button class="expand-button" type="button" data-expand="${escapeHtml(verbId)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Fechar' : 'Abrir'} informações extras sobre ${escapeHtml(verb.verb)}"><span class="expand-icon" aria-hidden="true"></span></button>` : ''}
          </div>
        </div>
        ${expanded ? `
          <div class="expanded-content">
            ${renderPolysemy(verb)}
            ${extras.length ? `<div class="extras-grid extras-${extras.length}">${extras.map(renderExtraBlock).join('')}</div>` : ''}
            ${renderSecondaryExample(verb)}
          </div>
        ` : ''}
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
      .filter(matchesPreposition)
      .filter(matchesSearch)
      .sort((a, b) => a.verb.localeCompare(b.verb, 'en'));
    render();
  };

  const updateHeroCounts = () => {
    const eligible = state.all.filter(eligibleForPage);
    if (totalCountEl) totalCountEl.textContent = eligible.length.toString();
  };

  const populateJumpOptions = () => {
    if (!jumpListEl) return;
    jumpListEl.innerHTML = state.all
      .filter(eligibleForPage)
      .sort((a, b) => a.verb.localeCompare(b.verb, 'en'))
      .map((verb) => `<option value="${escapeHtml(verb.verb)}"></option>`)
      .join('');
  };

  const populatePrepositions = () => {
    if (!prepositionEl) return;
    const counts = new Map();
    state.all.filter(eligibleForPage).forEach((verb) => {
      extractPrepositions(verb).forEach((prep) => counts.set(prep, (counts.get(prep) || 0) + 1));
    });
    const options = [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort(([a], [b]) => a.localeCompare(b, 'en'));
    prepositionEl.innerHTML = '<option value="">Todas</option>'
      + options.map(([prep, count]) => `<option value="${prep}">${prep} · ${count}</option>`).join('');
  };

  const populateAlphabet = () => {
    if (!alphabetEl) return;
    const letters = new Set(state.all.filter(eligibleForPage).map((verb) => verb.verb.charAt(0).toUpperCase()));
    alphabetEl.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
      const enabled = letters.has(letter);
      return `<button type="button" class="alphabet-letter ${enabled ? '' : 'is-disabled'}" data-letter="${letter}" ${enabled ? '' : 'disabled'}>${letter}</button>`;
    }).join('');
  };

  const saveFavorites = () => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites].sort()));
    } catch {
      // localStorage may be unavailable in restrictive browsing modes
    }
  };

  const resetDiscovery = () => {
    state.filter = 'all';
    state.search = '';
    state.preposition = '';
    if (searchEl) searchEl.value = '';
    if (prepositionEl) prepositionEl.value = '';
    filterEls.forEach((el) => el.classList.toggle('is-active', el.dataset.filter === 'all'));
    applyFilters();
  };

  const highlightTarget = (verb, { open = false } = {}) => {
    if (open) state.openIds.add(verbIdFor(verb));
    if (open) render();
    const anchorId = `verb-${slugify(verb.verb)}`;
    const targetEl = document.getElementById(anchorId);
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.add('is-target');
    window.history.replaceState(null, '', `#${anchorId}`);
    window.setTimeout(() => targetEl.classList.remove('is-target'), 2200);
  };

  const findClosestVerb = (value) => {
    const wanted = normalize(value);
    if (!wanted) return null;
    const eligible = state.all.filter(eligibleForPage);
    const exact = eligible.find((verb) => normalize(verb.verb) === wanted);
    if (exact) return exact;
    const prefix = eligible.find((verb) => normalize(verb.verb).startsWith(wanted));
    if (prefix) return prefix;
    if (wanted.length < 4) return null;
    const ranked = eligible
      .map((verb) => ({ verb, distance: levenshtein(normalize(verb.verb), wanted) }))
      .sort((a, b) => a.distance - b.distance || a.verb.verb.localeCompare(b.verb.verb, 'en'));
    const best = ranked[0];
    const threshold = wanted.length <= 5 ? 1 : 2;
    return best && best.distance <= threshold ? best.verb : null;
  };

  const goToVerb = (value, { open = false } = {}) => {
    const target = findClosestVerb(value);
    if (!target) {
      jumpEl?.classList.add('has-error');
      window.setTimeout(() => jumpEl?.classList.remove('has-error'), 1400);
      return;
    }
    if (jumpEl) jumpEl.value = target.verb;
    resetDiscovery();
    window.requestAnimationFrame(() => highlightTarget(target, { open }));
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
    const favoriteButton = event.target.closest('[data-favorite]');
    if (favoriteButton) {
      const verb = favoriteButton.dataset.favorite;
      if (state.favorites.has(verb)) state.favorites.delete(verb);
      else state.favorites.add(verb);
      saveFavorites();
      if (state.filter === 'favorites') applyFilters();
      else render();
      return;
    }

    const audioButton = event.target.closest('[data-audio]');
    if (audioButton && !audioButton.disabled) {
      playAudio(audioButton.dataset.audio, audioButton);
      return;
    }

    const expandButton = event.target.closest('[data-expand]');
    if (expandButton) {
      const id = expandButton.dataset.expand;
      if (state.openIds.has(id)) state.openIds.delete(id);
      else state.openIds.add(id);
      render();
      return;
    }

    const verbLink = event.target.closest('[data-go-verb]');
    if (verbLink) {
      goToVerb(verbLink.dataset.goVerb, { open: true });
      return;
    }

    const letterButton = event.target.closest('[data-letter]');
    if (letterButton && !letterButton.disabled) {
      const letter = letterButton.dataset.letter;
      resetDiscovery();
      const target = state.all
        .filter(eligibleForPage)
        .sort((a, b) => a.verb.localeCompare(b.verb, 'en'))
        .find((verb) => verb.verb.toUpperCase().startsWith(letter));
      if (target) window.requestAnimationFrame(() => highlightTarget(target));
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

  prepositionEl?.addEventListener('change', (event) => {
    state.preposition = event.target.value || '';
    applyFilters();
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

    if (manifest.polysemyFile) state.polysemy = await fetchJson(manifest.polysemyFile);
    if (manifest.secondaryExamplesFile) state.secondaryExamples = await fetchJson(manifest.secondaryExamplesFile);

    return verbs;
  };

  loadCorpus()
    .then((verbs) => {
      state.all = verbs;
      knownVerbLookup = new Map(verbs.map((verb) => [normalize(verb.verb), verb]));
      updateHeroCounts();
      populateJumpOptions();
      populatePrepositions();
      populateAlphabet();
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