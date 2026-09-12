(() => {
  'use strict';

  const listEl = document.querySelector('[data-verbs-list]');
  if (!listEl) return;

  const speakerIcon = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5z"></path>
      <path d="M17 9.5a4 4 0 010 5"></path>
    </svg>
  `;

  const splitForms = (value = '') => String(value)
    .split(/\s*(?:\/|,|;|\bor\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const formFileName = (form = '') => String(form)
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const makeAudioButton = (path, label, modifier = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `inline-audio-button ${modifier}`.trim();
    button.dataset.audio = path;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = speakerIcon;
    return button;
  };

  const formAudioPath = (verbName, form, wordAudio) => {
    const verbKey = String(verbName || '').trim().toLowerCase();
    const formKey = String(form || '').trim().toLowerCase();

    // Same spelling and pronunciation can reuse the base-verb recording.
    // "read" is the exception: base /riːd/, past/participle /rɛd/.
    if (formKey === verbKey && verbKey !== 'read' && wordAudio) return wordAudio;

    return `audio/advanced/form/${formFileName(form)}.wav`;
  };

  const enhanceFormCell = (cell, kind, verbName, wordAudio) => {
    if (!cell) return;
    const rawValue = cell.textContent.trim();
    const forms = splitForms(rawValue);
    if (!forms.length || rawValue === '—') return;

    const list = document.createElement('div');
    list.className = 'form-audio-list';

    forms.forEach((form) => {
      const chip = document.createElement('span');
      chip.className = `form-value ${kind === 'past' ? 'past-form' : 'participle-form'} form-audio-chip`;

      const text = document.createElement('span');
      text.className = 'form-audio-text';
      text.textContent = form;
      chip.appendChild(text);

      const spokenLabel = kind === 'past' ? 'passado' : 'particípio';
      const path = formAudioPath(verbName, form, wordAudio);
      chip.appendChild(makeAudioButton(path, `Ouvir ${spokenLabel}: ${form}`, 'inline-audio-button--form'));
      list.appendChild(chip);
    });

    cell.replaceChildren(list);
  };

  const enhanceArticle = (article) => {
    if (!(article instanceof Element) || article.dataset.formAudioEnhanced === 'true') return;

    const row = article.querySelector('.advanced-row');
    if (!row) return;

    const audioCell = row.querySelector('.audio-cell');
    const wordAudio = audioCell?.querySelector('.word-audio')?.dataset.audio || '';
    const exampleAudio = audioCell?.querySelector('.example-audio')?.dataset.audio || '';
    const verbName = article.dataset.verbName || row.querySelector('.verb-title-line > span')?.textContent?.trim() || '';

    const titleLine = row.querySelector('.verb-title-line');
    const favoriteButton = titleLine?.querySelector('.favorite-button');
    if (titleLine && wordAudio) {
      const button = makeAudioButton(wordAudio, `Ouvir verbo: ${verbName}`, 'inline-audio-button--verb');
      if (favoriteButton) favoriteButton.before(button);
      else titleLine.appendChild(button);
    }

    enhanceFormCell(row.querySelector('.past-cell'), 'past', verbName, wordAudio);
    enhanceFormCell(row.querySelector('.participle-cell'), 'participle', verbName, wordAudio);

    const exampleCell = row.querySelector('.example-cell');
    if (exampleCell && exampleAudio) {
      const exampleText = exampleCell.textContent.trim();
      const line = document.createElement('div');
      line.className = 'example-audio-line';
      line.appendChild(makeAudioButton(exampleAudio, `Ouvir frase com ${verbName}`, 'inline-audio-button--example'));
      const text = document.createElement('span');
      text.textContent = exampleText;
      line.appendChild(text);
      exampleCell.replaceChildren(line);
    }

    audioCell?.remove();
    article.dataset.formAudioEnhanced = 'true';
  };

  const enhanceRows = (root = listEl) => {
    if (root.matches?.('.advanced-verb')) enhanceArticle(root);
    root.querySelectorAll?.('.advanced-verb').forEach(enhanceArticle);
  };

  enhanceRows();

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceRows(node);
      });
    });
  });

  // The core renderer replaces the list's direct children on filtering,
  // expansion and favorites. Watching only that level avoids observer loops.
  observer.observe(listEl, { childList: true });
})();
