(() => {
  'use strict';

  const listEl = document.querySelector('[data-verbs-list]');
  if (!listEl) return;

  const MAX_OPTIONS = 6;
  let data = {};
  let ready = false;
  let enhanceQueued = false;
  const selectedByVerb = new Map();

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };

  const normalizeEntries = (entries) => {
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    return entries
      .filter((entry) => entry && entry.particle && entry.form && entry.meaning && entry.pattern && entry.example && entry.note)
      .filter((entry) => {
        const key = String(entry.particle).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_OPTIONS);
  };

  const loadData = async () => {
    const manifest = await fetchJson('data/multiword.json');
    const chunks = await Promise.all((manifest.chunks || []).map(fetchJson));
    const merged = Object.assign({}, ...chunks.map((chunk) => chunk.verbs || {}));

    if (manifest.overridesFile) {
      const overrides = await fetchJson(manifest.overridesFile);
      Object.assign(merged, overrides.verbs || {});
    }

    data = Object.fromEntries(
      Object.entries(merged)
        .map(([verb, entries]) => [verb, normalizeEntries(entries)])
        .filter(([, entries]) => entries.length)
    );
  };

  const findEntry = (verb, particle) => {
    const entries = data[verb] || [];
    return entries.find((entry) => entry.particle === particle) || entries[0] || null;
  };

  const renderPanel = (article) => {
    const verb = article.dataset.verbName;
    const entries = data[verb];
    const expandedContent = article.querySelector('.expanded-content');
    if (!entries || !entries.length || !expandedContent) return;

    let selected = selectedByVerb.get(verb);
    if (!selected || !entries.some((entry) => entry.particle === selected)) {
      selected = entries[0].particle;
      selectedByVerb.set(verb, selected);
    }

    const entry = findEntry(verb, selected);
    if (!entry) return;

    let panel = expandedContent.querySelector('[data-multiword-panel]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'multiword-panel';
      panel.dataset.multiwordPanel = verb;
      expandedContent.prepend(panel);
    }

    panel.innerHTML = `
      <div class="multiword-heading">
        <div>
          <span class="multiword-kicker">COMBINAÇÕES COM O VERBO</span>
          <h4>${escapeHtml(verb)} + ...</h4>
        </div>
        <p>Escolha uma opção para ver significado, estrutura, exemplo e um detalhe importante</p>
      </div>

      <div class="multiword-tabs" role="tablist" aria-label="Combinações com ${escapeHtml(verb)}">
        ${entries.map((item) => `
          <button
            type="button"
            class="multiword-tab ${item.particle === selected ? 'is-active' : ''}"
            data-multiword-verb="${escapeHtml(verb)}"
            data-multiword-particle="${escapeHtml(item.particle)}"
            role="tab"
            aria-selected="${item.particle === selected}"
          >${escapeHtml(item.particle)}</button>
        `).join('')}
      </div>

      <div class="multiword-detail" role="tabpanel">
        <div class="multiword-form-block">
          <span class="multiword-form">${escapeHtml(entry.form)}</span>
          <strong>${escapeHtml(entry.meaning)}</strong>
        </div>

        <div class="multiword-info">
          <div class="multiword-info-card">
            <span>Estrutura</span>
            <code>${escapeHtml(entry.pattern)}</code>
          </div>
          <div class="multiword-info-card multiword-example-card">
            <span>Exemplo</span>
            <p>${escapeHtml(entry.example)}</p>
          </div>
          <div class="multiword-info-card multiword-note-card">
            <span>Importante</span>
            <p>${escapeHtml(entry.note)}</p>
          </div>
        </div>
      </div>
    `;
  };

  const enhanceVisiblePanels = () => {
    if (!ready) return;
    listEl.querySelectorAll('.advanced-verb.is-expanded').forEach(renderPanel);
  };

  const scheduleEnhance = () => {
    if (!ready || enhanceQueued) return;
    enhanceQueued = true;
    window.requestAnimationFrame(() => {
      enhanceQueued = false;
      enhanceVisiblePanels();
    });
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiword-particle]');
    if (button) {
      const verb = button.dataset.multiwordVerb;
      const particle = button.dataset.multiwordParticle;
      if (!verb || !particle) return;
      selectedByVerb.set(verb, particle);
      const article = button.closest('.advanced-verb');
      if (article) renderPanel(article);
      return;
    }

    if (event.target.closest('[data-expand], [data-favorite], [data-filter], [data-go-verb], [data-letter]')) {
      scheduleEnhance();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-verb-search]')) scheduleEnhance();
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-preposition-filter]')) scheduleEnhance();
  });

  // Observa apenas substituições diretas da lista. Não acompanha a subárvore,
  // portanto a inserção do próprio painel não dispara uma cadeia infinita de mutações.
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(listEl, { childList: true });

  loadData()
    .then(() => {
      ready = true;
      document.documentElement.dataset.multiwordReady = 'true';
      scheduleEnhance();
    })
    .catch((error) => console.error('Erro ao carregar combinações multiword:', error));
})();
