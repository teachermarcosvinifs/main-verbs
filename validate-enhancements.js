const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join('data', 'verbs.json'), 'utf8'));
const loadChunk = (filePath) => {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload) ? payload : (payload.verbs || []);
};

const verbs = (manifest.chunks || []).flatMap(loadChunk);
const known = new Set(verbs.map((item) => item.verb));
const errors = [];
const endsWithPeriod = (value) => typeof value === 'string' && value.trim().endsWith('.');

const polysemy = manifest.polysemyFile
  ? JSON.parse(fs.readFileSync(manifest.polysemyFile, 'utf8'))
  : {};
const secondary = manifest.secondaryExamplesFile
  ? JSON.parse(fs.readFileSync(manifest.secondaryExamplesFile, 'utf8'))
  : {};

for (const [verb, uses] of Object.entries(polysemy)) {
  if (!known.has(verb)) errors.push(`${verb}: polissêmico sem verbo correspondente`);
  if (!Array.isArray(uses) || uses.length < 2 || uses.length > 4) {
    errors.push(`${verb}: usos principais precisam ter entre 2 e 4 sentidos`);
    continue;
  }
  for (const [index, use] of uses.entries()) {
    if (!use || typeof use !== 'object') {
      errors.push(`${verb}: uso ${index + 1} inválido`);
      continue;
    }
    if (!use.label || !use.pattern) errors.push(`${verb}: uso ${index + 1} sem label/pattern`);
    const examples = Array.isArray(use.examples) ? use.examples : [];
    if (!examples.length) errors.push(`${verb}: uso ${index + 1} sem exemplos curtos`);
    for (const value of [use.label, use.pattern, ...examples].filter(Boolean)) {
      if (endsWithPeriod(value)) errors.push(`${verb}: ponto final visível em usos principais: ${value}`);
    }
  }
}

for (const [verb, item] of Object.entries(secondary)) {
  if (!known.has(verb)) errors.push(`${verb}: segundo padrão sem verbo correspondente`);
  if (!item || typeof item !== 'object' || !item.pattern || !item.example) {
    errors.push(`${verb}: segundo padrão incompleto`);
    continue;
  }
  if (endsWithPeriod(item.pattern) || endsWithPeriod(item.example)) {
    errors.push(`${verb}: ponto final visível no segundo padrão`);
  }
  const primary = verbs.find((entry) => entry.verb === verb)?.example;
  if (primary && primary.toLowerCase() === item.example.toLowerCase()) {
    errors.push(`${verb}: segundo exemplo duplica o exemplo principal`);
  }
}

console.log(`Verbos polissêmicos tratados: ${Object.keys(polysemy).length}`);
console.log(`Segundos padrões adicionados: ${Object.keys(secondary).length}`);

if (errors.length) {
  console.error('\nERROS');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidação dos aprimoramentos concluída sem erros');
