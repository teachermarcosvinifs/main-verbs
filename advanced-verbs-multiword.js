(() => {
  'use strict';

  const listEl = document.querySelector('[data-verbs-list]');
  if (!listEl) return;

  let data = {};
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

  const loadData = async () => {
    const manifest = await fetchJson('data/multiword.json');
    const chunks = await Promise.all((manifest.chunks || []).map(fetchJson));
    data = Object.assign({}, ...chunks.map((chunk) => chunk.verbs || {}));
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

    const old = expandedContent.querySelector('[data-multiword-panel]');
    if (old) old.remove();

    const panel = document.createElement('section');
    panel.className = 'multiword-panel';
    panel.dataset.multiwordPanel = verb;
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

    expandedContent.prepend(panel);
  };

  const enhanceVisiblePanels = () => {
    listEl.querySelectorAll('.advanced-verb.is-expanded').forEach(renderPanel);
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiword-particle]');
    if (!button) return;

    const verb = button.dataset.multiwordVerb;
    const particle = button.dataset.multiwordParticle;
    if (!verb || !particle) return;

    selectedByVerb.set(verb, particle);
    const article = button.closest('.advanced-verb');
    if (article) renderPanel(article);
  });

  const observer = new MutationObserver(() => enhanceVisiblePanels());
  observer.observe(listEl, { childList: true, subtree: true });

  loadData()
    .then(() => {
      enhanceVisiblePanels();
      document.documentElement.dataset.multiwordReady = 'true';
    })
    .catch((error) => console.error('Erro ao carregar combinações multiword:', error));
})();
