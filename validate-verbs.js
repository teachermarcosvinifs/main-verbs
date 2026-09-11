const fs = require('fs');
const path = require('path');

const manifestPath = path.join('data', 'verbs.json');
const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function loadVerbs(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.verbs)) return source.verbs;
  if (Array.isArray(source.chunks) && source.chunks.length) {
    return source.chunks.flatMap((chunkPath) => {
      const chunk = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
      return Array.isArray(chunk) ? chunk : (chunk.verbs || []);
    });
  }
  return [];
}

const verbs = loadVerbs(payload);
const allowedTiers = new Set(['B2', 'C1-C2']);
const allowedExtraTypes = new Set([
  'structure',
  'combinations',
  'contrast',
  'variation',
  'other_use',
  'alternative_forms',
  'register',
]);

const metaPatterns = [
  /evite traduzir/i,
  /pense no contexto/i,
  /pratique/i,
  /repita/i,
  /use no seu dia a dia/i,
  /isso ajuda/i,
  /this helps/i,
  /remember that/i,
  /keep in mind/i,
];

const britishMarkers = [
  /\bmum\b/i,
  /\bcar park\b/i,
  /\bprogramme(s)?\b/i,
  /\bneighbour(s|hood)?\b/i,
  /\bcolour(s|ed|ing)?\b/i,
  /\bcentre(s)?\b/i,
  /\bfavourite(s)?\b/i,
  /\borganise(d|s|ing)?\b/i,
  /\brecognise(d|s|ing)?\b/i,
  /\bflatmate\b/i,
  /\bcourgette(s)?\b/i,
];

const errors = [];
const warnings = [];
const lexemes = new Set();
const examples = new Map();
const openings = new Map();
const tierCounts = { B2: 0, 'C1-C2': 0 };

const words = (text = '') => text.trim().split(/\s+/).filter(Boolean);
const visibleTextEndsWithPeriod = (value) =>
  typeof value === 'string' && value.trim().endsWith('.');

const checkVisibleText = (label, field, value) => {
  if (!value || typeof value !== 'string') return;
  if (visibleTextEndsWithPeriod(value)) {
    errors.push(`${label}: ponto final visível proibido em ${field}`);
  }
};

for (const [index, verb] of verbs.entries()) {
  const label = verb.verb || `registro ${index + 1}`;
  const required = ['verb', 'tier', 'past', 'participle', 'meaning', 'example'];

  for (const field of required) {
    if (!verb[field] || !String(verb[field]).trim()) {
      errors.push(`${label}: campo obrigatório ausente: ${field}`);
    }
  }

  const lexeme = String(verb.verb || '').toLowerCase();
  if (lexeme && lexemes.has(lexeme)) errors.push(`${label}: verbo duplicado entre níveis`);
  if (lexeme) lexemes.add(lexeme);

  if (verb.tier && !allowedTiers.has(verb.tier)) {
    errors.push(`${label}: tier inválido: ${verb.tier}`);
  } else if (verb.tier) {
    tierCounts[verb.tier] += 1;
  }

  const qa = verb.qa || {};
  const approved = verb.approved === true || qa.status === 'approved';
  if (!approved) errors.push(`${label}: registro ainda não aprovado`);

  if (qa.status === 'approved') {
    if (!qa.patternChecked) errors.push(`${label}: aprovado sem patternChecked`);
    if (!qa.naturalnessChecked) errors.push(`${label}: aprovado sem naturalnessChecked`);
    if (!qa.antiAiChecked) errors.push(`${label}: aprovado sem antiAiChecked`);
    if (!Array.isArray(qa.evidence) || qa.evidence.length === 0) {
      errors.push(`${label}: aprovado sem evidence`);
    }
  }

  const extras = Array.isArray(verb.extras) ? verb.extras : [];
  const visibleText = [
    verb.example,
    verb.meaning,
    ...extras.flatMap((block) => [block.title, block.text, ...(block.items || [])]),
  ].filter(Boolean).join(' ');

  if (metaPatterns.some((pattern) => pattern.test(visibleText))) {
    errors.push(`${label}: metacomentário proibido detectado`);
  }

  checkVisibleText(label, 'example', verb.example);
  checkVisibleText(label, 'meaning', verb.meaning);

  extras.forEach((block, blockIndex) => {
    checkVisibleText(label, `extras[${blockIndex}].title`, block.title);
    checkVisibleText(label, `extras[${blockIndex}].text`, block.text);
    (block.items || []).forEach((item, itemIndex) => {
      checkVisibleText(label, `extras[${blockIndex}].items[${itemIndex}]`, item);
    });
  });

  const example = (verb.example || '').trim();
  if (example) {
    const exampleKey = example.toLowerCase();
    if (examples.has(exampleKey)) {
      errors.push(`${label}: exemplo duplicado com ${examples.get(exampleKey)}`);
    }
    examples.set(exampleKey, label);

    const opening = words(example).slice(0, 3).join(' ').toLowerCase();
    if (opening) {
      if (!openings.has(opening)) openings.set(opening, []);
      openings.get(opening).push(label);
    }

    const count = words(example).length;
    if (count < 4 || count > 20) {
      warnings.push(`${label}: exemplo com ${count} palavras; revisar tamanho`);
    }

    if (britishMarkers.some((pattern) => pattern.test(example))) {
      warnings.push(`${label}: possível forma britânica no exemplo; padrão é American English`);
    }
  }

  if (extras.length > 4) errors.push(`${label}: mais de 4 módulos extras`);

  for (const block of extras) {
    if (!allowedExtraTypes.has(block.type)) {
      errors.push(`${label}: módulo inválido: ${block.type}`);
    }

    const hasContent =
      (block.text && String(block.text).trim())
      || (Array.isArray(block.items) && block.items.length);

    if (!hasContent) errors.push(`${label}: módulo ${block.type} sem conteúdo`);
  }
}

for (const [opening, labels] of openings.entries()) {
  if (labels.length >= 4) {
    warnings.push(`abertura repetida "${opening}" em ${labels.length} exemplos: ${labels.join(', ')}`);
  }
}

if (payload.counts) {
  if (tierCounts.B2 !== payload.counts.B2) errors.push(`contagem B2 divergente: ${tierCounts.B2} != ${payload.counts.B2}`);
  if (tierCounts['C1-C2'] !== payload.counts['C1-C2']) errors.push(`contagem C1-C2 divergente: ${tierCounts['C1-C2']} != ${payload.counts['C1-C2']}`);
  if (verbs.length !== payload.counts.cumulative) errors.push(`contagem cumulativa divergente: ${verbs.length} != ${payload.counts.cumulative}`);
}

console.log(`Verbos analisados: ${verbs.length}`);
console.log(`B2: ${tierCounts.B2} | C1-C2: ${tierCounts['C1-C2']}`);

if (warnings.length) {
  console.log('\nAVISOS');
  warnings.forEach((item) => console.log(`- ${item}`));
}

if (errors.length) {
  console.error('\nERROS');
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('\nValidação estrutural concluída sem erros');
