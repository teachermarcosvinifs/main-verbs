const fs = require('fs');
const path = require('path');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = readJson(path.join('data', 'multiword.json'));
const verbManifest = readJson(path.join('data', 'verbs.json'));

const corpus = (verbManifest.chunks || []).flatMap((file) => {
  const payload = readJson(file);
  return Array.isArray(payload) ? payload : (payload.verbs || []);
});
const corpusSet = new Set(corpus.map((item) => item.verb));

const errors = [];
const merged = {};
const sourceFiles = [...(manifest.chunks || []), ...(manifest.relationChunks || [])];

for (const file of sourceFiles) {
  const payload = readJson(file);
  for (const [verb, entries] of Object.entries(payload.verbs || {})) {
    if (merged[verb]) errors.push(`${verb}: duplicado entre arquivos-base de relações`);
    merged[verb] = entries;
  }
}

if (manifest.overridesFile) {
  const overrides = readJson(manifest.overridesFile);
  for (const [verb, entries] of Object.entries(overrides.verbs || {})) {
    if (!merged[verb]) errors.push(`${verb}: override sem verbo-base correspondente`);
    merged[verb] = entries;
  }
}

const allExamples = new Set();
let combinationCount = 0;
const required = ['particle', 'form', 'meaning', 'pattern', 'example', 'note'];
const endsWithPeriod = (value) => typeof value === 'string' && value.trim().endsWith('.');

for (const [verb, entries] of Object.entries(merged)) {
  if (!corpusSet.has(verb)) errors.push(`${verb}: verbo-base não existe no corpus`);
  if (!Array.isArray(entries)) {
    errors.push(`${verb}: conteúdo não é array`);
    continue;
  }
  if (entries.length < 2 || entries.length > 6) {
    errors.push(`${verb}: esperado 2–6 combinações, recebido ${entries.length}`);
  }

  const particles = new Set();
  const forms = new Set();
  for (const [index, entry] of entries.entries()) {
    combinationCount += 1;
    for (const field of required) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        errors.push(`${verb}[${index}]: campo obrigatório ausente: ${field}`);
      }
    }
    if (!entry || typeof entry !== 'object') continue;
    if (particles.has(entry.particle)) errors.push(`${verb}: partícula/preposição duplicada: ${entry.particle}`);
    if (forms.has(entry.form)) errors.push(`${verb}: forma duplicada: ${entry.form}`);
    particles.add(entry.particle);
    forms.add(entry.form);

    for (const field of required) {
      if (endsWithPeriod(entry[field])) errors.push(`${verb} ${entry.form}: ponto final visível em ${field}`);
    }

    if (typeof entry.example === 'string') {
      const normalizedExample = entry.example.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (allExamples.has(normalizedExample)) errors.push(`${verb}: exemplo duplicado: ${entry.example}`);
      allExamples.add(normalizedExample);
    }
  }
}

const effectiveVerbCount = Object.keys(merged).length;
if (manifest.counts?.effectiveVerbs !== effectiveVerbCount) {
  errors.push(`contagem de verbos divergente: ${effectiveVerbCount} != ${manifest.counts?.effectiveVerbs}`);
}

const minimumMajority = Math.floor(corpus.length / 2) + 1;
if (effectiveVerbCount < minimumMajority) {
  errors.push(`cobertura abaixo da maioria do corpus: ${effectiveVerbCount}/${corpus.length}; mínimo ${minimumMajority}`);
}

console.log(`Verbos-base com painel: ${effectiveVerbCount}/${corpus.length}`);
console.log(`Cobertura: ${((effectiveVerbCount / corpus.length) * 100).toFixed(1)}%`);
console.log(`Combinações interativas: ${combinationCount}`);
console.log(`Exemplos únicos: ${allExamples.size}`);

if (errors.length) {
  console.error('\nERROS');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidação de relações concluída sem erros');
