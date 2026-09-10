const fs = require('fs');

const payload = JSON.parse(fs.readFileSync('data/verbs.json', 'utf8'));
const verbs = Array.isArray(payload) ? payload : (payload.verbs || []);

const allowedTiers = new Set(['B2', 'C1-C2']);
const allowedExtraTypes = new Set(['structure','combinations','contrast','variation','other_use','alternative_forms','register']);
const metaPatterns = [
  /evite traduzir/i,
  /pense no contexto/i,
  /pratique/i,
  /repita/i,
  /use no seu dia a dia/i,
  /isso ajuda/i,
  /this helps/i,
  /remember that/i,
  /keep in mind/i
];
const genericTerms = ['system','process','issue','challenge','solution','result','results','strategy','opportunity','efficiency','performance','innovation','growth'];

const errors = [];
const warnings = [];
const ids = new Set();
const exampleMap = new Map();
const openings = new Map();

function words(text = '') {
  return text.trim().split(/\s+/).filter(Boolean);
}

function pushOpen(verb) {
  const opening = words(verb.example).slice(0, 3).join(' ').toLowerCase();
  if (!opening) return;
  if (!openings.has(opening)) openings.set(opening, []);
  openings.get(opening).push(verb.verb);
}

for (const [index, verb] of verbs.entries()) {
  const label = verb.verb || `registro ${index + 1}`;
  const required = ['id','verb','tier','past','participle','meaning','example'];
  for (const field of required) {
    if (!verb[field] || !String(verb[field]).trim()) errors.push(`${label}: campo obrigatório ausente: ${field}`);
  }

  if (verb.id) {
    if (ids.has(verb.id)) errors.push(`${label}: id duplicado: ${verb.id}`);
    ids.add(verb.id);
  }

  if (verb.tier && !allowedTiers.has(verb.tier)) errors.push(`${label}: tier inválido: ${verb.tier}`);

  const qa = verb.qa || {};
  if (qa.status === 'approved') {
    if (!qa.patternChecked) errors.push(`${label}: aprovado sem patternChecked`);
    if (!qa.naturalnessChecked) errors.push(`${label}: aprovado sem naturalnessChecked`);
    if (!qa.antiAiChecked) errors.push(`${label}: aprovado sem antiAiChecked`);
    if (!Array.isArray(qa.evidence) || qa.evidence.length === 0) errors.push(`${label}: aprovado sem evidence`);
  }

  const visibleText = [verb.example, verb.meaning, ...(verb.extras || []).flatMap(x => [x.title, x.text, ...(x.items || [])])].filter(Boolean).join(' ');
  if (metaPatterns.some((pattern) => pattern.test(visibleText))) errors.push(`${label}: metacomentário proibido detectado`);

  const example = (verb.example || '').trim();
  if (example) {
    const key = example.toLowerCase();
    if (exampleMap.has(key)) errors.push(`${label}: exemplo duplicado com ${exampleMap.get(key)}`);
    exampleMap.set(key, label);
    pushOpen(verb);

    const count = words(example).length;
    if (count < 4 || count > 20) warnings.push(`${label}: exemplo com ${count} palavras; revisar tamanho`);

    const genericHits = genericTerms.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(example));
    if (genericHits.length >= 2) warnings.push(`${label}: exemplo concentra termos genéricos (${genericHits.join(', ')})`);
  }

  const extras = Array.isArray(verb.extras) ? verb.extras : [];
  if (extras.length > 4) errors.push(`${label}: mais de 4 módulos extras`);
  for (const block of extras) {
    if (!allowedExtraTypes.has(block.type)) errors.push(`${label}: módulo inválido: ${block.type}`);
    const hasContent = (block.text && String(block.text).trim()) || (Array.isArray(block.items) && block.items.length);
    if (!hasContent) errors.push(`${label}: módulo ${block.type} sem conteúdo`);
  }
}

for (const [opening, labels] of openings.entries()) {
  if (labels.length >= 4) warnings.push(`abertura repetida "${opening}" em ${labels.length} exemplos: ${labels.join(', ')}`);
}

console.log(`Verbos analisados: ${verbs.length}`);
if (warnings.length) {
  console.log('\nAVISOS');
  warnings.forEach((item) => console.log(`- ${item}`));
}
if (errors.length) {
  console.error('\nERROS');
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('\nValidação estrutural concluída sem erros.');
