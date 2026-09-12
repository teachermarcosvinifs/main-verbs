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
for (const file of manifest.chunks || []) {
  const payload = readJson(file);
  for (const [verb, entries] of Object.entries(payload.verbs || {})) {
    if (merged[verb]) errors.push(`${verb}: duplicado entre chunks`);
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
  if (entries.length < 3 || entries.length > 8) {
    errors.push(`${verb}: esperado 3–8 combinações, recebido ${entries.length}`);
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
    if (particles.has(entry.particle)) errors.push(`${verb}: partícula duplicada: ${entry.particle}`);
    if (forms.has(entry.form)) errors.push(`${verb}: forma duplicada: ${entry.form}`);
    particles.add(entry.particle);
    forms.add(entry.form);

    for (const field of required) {
      if (endsWithPeriod(entry[field])) errors.push(`${verb} ${entry.form}: ponto final visível em ${field}`);
    }

    const normalizedExample = entry.example.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (allExamples.has(normalizedExample)) errors.push(`${verb}: exemplo duplicado: ${entry.example}`);
    allExamples.add(normalizedExample);
  }
}

if (manifest.counts?.verbs !== Object.keys(merged).length) {
  errors.push(`contagem de verbos divergente: ${Object.keys(merged).length} != ${manifest.counts?.verbs}`);
}
if (manifest.counts?.combinations !== combinationCount) {
  errors.push(`contagem de combinações divergente: ${combinationCount} != ${manifest.counts?.combinations}`);
}

console.log(`Verbos-base com painel: ${Object.keys(merged).length}`);
console.log(`Combinações interativas: ${combinationCount}`);
console.log(`Exemplos únicos: ${allExamples.size}`);

if (errors.length) {
  console.error('\nERROS');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidação multiword concluída sem erros');
