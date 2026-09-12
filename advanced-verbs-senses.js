(() => {
  'use strict';

  const listEl = document.querySelector('[data-verbs-list]');
  if (!listEl) return;

  let senseMap = {};
  let ready = false;

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };

  const make = (tag, className, text = '') => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  const renderSensePanel = (panel, uses) => {
    panel.replaceChildren();
    panel.classList.add('is-enriched-senses');

    const title = make('div', 'special-panel-title');
    title.append(
      make('span', '', 'Sentidos e usos'),
      make('small', '', `${uses.length} ${uses.length === 1 ? 'sentido frequente' : 'sentidos frequentes'}`),
    );

    const grid = make('div', 'polysemy-grid enriched-sense-grid');

    uses.forEach((use) => {
      const card = make('article', 'polysemy-use enriched-sense-card');
      const head = make('div', 'enriched-sense-head');
      head.append(
        make('strong', 'enriched-sense-name', use.sense || use.label || 'USE'),
        make('span', 'enriched-sense-pt', use.label || ''),
      );
      card.appendChild(head);

      if (use.definition) card.appendChild(make('p', 'enriched-sense-definition', use.definition));
      if (use.pattern) card.appendChild(make('code', 'enriched-sense-pattern', use.pattern));

      if (Array.isArray(use.examples) && use.examples.length) {
        const examples = make('div', 'enriched-sense-examples');
        use.examples.forEach((example) => examples.appendChild(make('span', '', example)));
        card.appendChild(examples);
      }

      grid.appendChild(card);
    });

    panel.append(title, grid);
  };

  const enhanceArticle = (article) => {
    if (!ready || !(article instanceof Element)) return;
    const verbName = article.dataset.verbName || '';
    const uses = senseMap[verbName] || [];
    const row = article.querySelector('.advanced-row');
    if (!row) return;

    const meaningCell = row.querySelector('.meaning-cell');
    if (meaningCell && meaningCell.dataset.senseEnhanced !== 'true') {
      const rawMeaning = meaningCell.textContent.trim();
      meaningCell.replaceChildren(make('span', 'meaning-primary', rawMeaning || '—'));
      if (uses.length) {
        meaningCell.appendChild(make('span', 'meaning-depth', `${uses.length} ${uses.length === 1 ? 'sentido' : 'sentidos'}`));
      }
      meaningCell.dataset.senseEnhanced = 'true';
      meaningCell.dataset.label = 'Sentido';
    }

    const panel = article.querySelector('.polysemy-panel');
    if (panel && uses.length && panel.dataset.senseEnhanced !== 'true') {
      renderSensePanel(panel, uses);
      panel.dataset.senseEnhanced = 'true';
    }
  };

  const enhanceRows = (root = listEl) => {
    if (!ready) return;
    if (root.matches?.('.advanced-verb')) enhanceArticle(root);
    root.querySelectorAll?.('.advanced-verb').forEach(enhanceArticle);
  };

  const observer = new MutationObserver((records) => {
    if (!ready) return;
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceRows(node);
      });
    });
  });
  observer.observe(listEl, { childList: true });

  const load = async () => {
    try {
      const manifest = await fetchJson('data/verbs.json');
      const base = manifest.polysemyFile ? await fetchJson(manifest.polysemyFile) : {};
      const overrides = manifest.polysemyOverridesFile ? await fetchJson(manifest.polysemyOverridesFile) : {};
      const definitions = manifest.polysemyDefinitionsFile ? await fetchJson(manifest.polysemyDefinitionsFile) : {};

      const mergedBase = { ...base, ...overrides };
      senseMap = Object.fromEntries(Object.entries(mergedBase).map(([verb, uses]) => {
        const defs = Array.isArray(definitions[verb]) ? definitions[verb] : [];
        return [verb, (Array.isArray(uses) ? uses : []).map((use, index) => ({ ...use, ...(defs[index] || {}) }))];
      }));

      ready = true;
      enhanceRows();
    } catch (error) {
      console.warn('Sense enrichment unavailable:', error);
    }
  };

  load();
})();
