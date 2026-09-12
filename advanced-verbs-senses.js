(() => {
  'use strict';

  const listEl = document.querySelector('[data-verbs-list]');
  if (!listEl) return;

  let senseMap = {};
  let rowSenseMap = {};
  let baseDefinitionMap = {};
  const definitionOpen = new Set();
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

  const renderBaseDefinitionPanel = (definition) => {
    const panel = make('section', 'base-definition-panel');
    const title = make('div', 'base-definition-title');
    title.append(
      make('span', '', 'Definição'),
      make('small', '', 'English'),
    );
    panel.append(title, make('p', 'base-definition-text', definition));
    return panel;
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

  const ensureBaseDefinition = (article, definition) => {
    if (!definition) return;
    const expanded = article.querySelector('.expanded-content');
    if (!expanded || expanded.querySelector('.base-definition-panel')) return;
    expanded.prepend(renderBaseDefinitionPanel(definition));
  };

  const ensureDefinitionOnlyControls = (article, verbName, definition) => {
    if (!definition) return;
    const coreExpand = article.querySelector('[data-expand]');
    if (coreExpand) return;

    const expandCell = article.querySelector('.expand-cell');
    if (!expandCell) return;

    let button = expandCell.querySelector('[data-definition-expand]');
    if (!button) {
      button = make('button', 'expand-button definition-expand-button');
      button.type = 'button';
      button.dataset.definitionExpand = verbName;
      button.setAttribute('aria-label', `Abrir definição de ${verbName}`);
      const icon = make('span', 'expand-icon');
      icon.setAttribute('aria-hidden', 'true');
      button.appendChild(icon);
      expandCell.appendChild(button);
    }

    const open = definitionOpen.has(verbName);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `${open ? 'Fechar' : 'Abrir'} definição de ${verbName}`);
    article.classList.toggle('is-expanded', open);

    let content = article.querySelector('[data-definition-only-content]');
    if (open && !content) {
      content = make('div', 'expanded-content definition-only-content');
      content.dataset.definitionOnlyContent = 'true';
      content.appendChild(renderBaseDefinitionPanel(definition));
      article.querySelector('.advanced-row')?.insertAdjacentElement('afterend', content);
    } else if (!open && content) {
      content.remove();
    }
  };

  const enhanceArticle = (article) => {
    if (!ready || !(article instanceof Element)) return;
    const verbName = article.dataset.verbName || '';
    const uses = senseMap[verbName] || [];
    const rowSense = rowSenseMap[verbName] || null;
    const definition = baseDefinitionMap[verbName] || '';
    const row = article.querySelector('.advanced-row');
    if (!row) return;

    const meaningCell = row.querySelector('.meaning-cell');
    if (meaningCell && meaningCell.dataset.senseEnhanced !== 'true') {
      const rawMeaning = meaningCell.textContent.trim();
      const contextualMeaning = rowSense?.meaning || rawMeaning || '—';
      meaningCell.replaceChildren(make('span', 'meaning-primary', contextualMeaning));

      if (rowSense?.tag || uses.length) {
        const meta = make('span', 'meaning-meta');
        if (rowSense?.tag) meta.appendChild(make('span', 'meaning-depth', rowSense.tag));
        if (uses.length) meta.appendChild(make('span', 'meaning-count', `${uses.length} ${uses.length === 1 ? 'sentido' : 'sentidos'}`));
        meaningCell.appendChild(meta);
      }

      meaningCell.dataset.senseEnhanced = 'true';
      meaningCell.dataset.label = 'Sentido';
    }

    const panel = article.querySelector('.polysemy-panel');
    if (panel && uses.length && panel.dataset.senseEnhanced !== 'true') {
      renderSensePanel(panel, uses);
      panel.dataset.senseEnhanced = 'true';
    }

    ensureBaseDefinition(article, definition);
    ensureDefinitionOnlyControls(article, verbName, definition);
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

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-definition-expand]');
    if (!button) return;
    const verbName = button.dataset.definitionExpand || '';
    if (!verbName) return;

    if (definitionOpen.has(verbName)) definitionOpen.delete(verbName);
    else definitionOpen.add(verbName);

    const article = button.closest('.advanced-verb');
    if (article) enhanceArticle(article);
  });

  const load = async () => {
    try {
      const manifest = await fetchJson('data/verbs.json');
      const base = manifest.polysemyFile ? await fetchJson(manifest.polysemyFile) : {};
      const overrides = manifest.polysemyOverridesFile ? await fetchJson(manifest.polysemyOverridesFile) : {};
      const definitions = manifest.polysemyDefinitionsFile ? await fetchJson(manifest.polysemyDefinitionsFile) : {};
      rowSenseMap = manifest.rowSenseOverridesFile ? await fetchJson(manifest.rowSenseOverridesFile) : {};

      const definitionFiles = Array.isArray(manifest.definitionFiles) ? manifest.definitionFiles : [];
      const definitionChunks = definitionFiles.length ? await Promise.all(definitionFiles.map(fetchJson)) : [];
      baseDefinitionMap = Object.assign({}, ...definitionChunks);

      const expectedDefinitions = manifest.counts?.cumulative;
      if (expectedDefinitions && Object.keys(baseDefinitionMap).length !== expectedDefinitions) {
        throw new Error(`Definições incompletas: ${Object.keys(baseDefinitionMap).length}/${expectedDefinitions}`);
      }

      const mergedBase = { ...base, ...overrides };
      senseMap = Object.fromEntries(Object.entries(mergedBase).map(([verb, uses]) => {
        const defs = Array.isArray(definitions[verb]) ? definitions[verb] : [];
        return [verb, (Array.isArray(uses) ? uses : []).map((use, index) => ({ ...(defs[index] || {}), ...use }))];
      }));

      ready = true;
      enhanceRows();
    } catch (error) {
      console.warn('Sense enrichment unavailable:', error);
    }
  };

  load();
})();
