const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join('data', 'verbs.json'), 'utf8'));

const loadChunk = (filePath) => {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload) ? payload : (payload.verbs || []);
};

const verbs = (manifest.chunks || []).flatMap(loadChunk);
const expectedVerbs = new Set(verbs.map((verb) => verb.verb));
const allowedTypes = new Set([
  'structure',
  'combinations',
  'prepositions',
  'contrast',
  'variation',
  'other_use',
  'alternative_forms',
]);

const errors = [];
const extrasByVerb = {};
const sourceByVerb = new Map();
const extrasChunks = manifest.extrasChunks || [];
const overrideChunks = new Set(manifest.extrasOverrideChunks || []);

for (const overrideFile of overrideChunks) {
  if (!extrasChunks.includes(overrideFile)) {
    errors.push(`${overrideFile}: override declarado mas ausente de extrasChunks`);
  }
}

let overridePhaseStarted = false;
let overriddenVerbs = 0;

for (const filePath of extrasChunks) {
  const isOverride = overrideChunks.has(filePath);

  if (isOverride) overridePhaseStarted = true;
  else if (overridePhaseStarted) {
    errors.push(`${filePath}: chunk-base aparece depois de um chunk de override`);
  }

  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    errors.push(`${filePath}: suplemento precisa ser um objeto verbo -> módulos`);
    continue;
  }

  for (const [verb, blocks] of Object.entries(payload)) {
    if (sourceByVerb.has(verb)) {
      if (!isOverride) {
        errors.push(`${verb}: duplicado em ${sourceByVerb.get(verb)} e ${filePath}`);
        continue;
      }
      overriddenVerbs += 1;
    } else if (isOverride) {
      errors.push(`${verb}: override sem entrada-base anterior em ${filePath}`);
    }

    sourceByVerb.set(verb, filePath);
    extrasByVerb[verb] = blocks;
  }
}

const actualVerbs = new Set(Object.keys(extrasByVerb));
for (const verb of expectedVerbs) {
  if (!actualVerbs.has(verb)) errors.push(`${verb}: sem informações extras`);
}
for (const verb of actualVerbs) {
  if (!expectedVerbs.has(verb)) errors.push(`${verb}: extra sem verbo correspondente no corpus`);
}

let withPrepositions = 0;
let withContrast = 0;
let totalModules = 0;

const endsWithPeriod = (value) => typeof value === 'string' && value.trim().endsWith('.');

for (const [verb, blocks] of Object.entries(extrasByVerb)) {
  if (!Array.isArray(blocks)) {
    errors.push(`${verb}: módulos não são um array`);
    continue;
  }

  if (blocks.length < 2 || blocks.length > 4) {
    errors.push(`${verb}: esperado entre 2 e 4 módulos, recebido ${blocks.length}`);
  }

  const types = new Set();
  for (const [index, block] of blocks.entries()) {
    if (!block || typeof block !== 'object') {
      errors.push(`${verb}: módulo ${index + 1} inválido`);
      continue;
    }

    if (!allowedTypes.has(block.type)) {
      errors.push(`${verb}: tipo de módulo proibido/inválido: ${block.type}`);
    }
    if (block.type === 'register') {
      errors.push(`${verb}: Registro não pode aparecer`);
    }
    if (types.has(block.type)) {
      errors.push(`${verb}: módulo duplicado: ${block.type}`);
    }
    types.add(block.type);

    const items = Array.isArray(block.items) ? block.items : [];
    const hasText = typeof block.text === 'string' && block.text.trim();
    if (!hasText && items.length === 0) {
      errors.push(`${verb}: módulo ${block.type} vazio`);
    }

    const visible = [block.title, block.text, ...items].filter(Boolean);
    for (const value of visible) {
      if (endsWithPeriod(value)) {
        errors.push(`${verb}: ponto final visível proibido em ${block.type}: ${value}`);
      }
    }
  }

  if (!types.has('structure')) errors.push(`${verb}: falta Estrutura`);
  if (!types.has('combinations')) errors.push(`${verb}: faltam Combinações`);
  if (types.has('prepositions')) withPrepositions += 1;
  if (types.has('contrast')) withContrast += 1;
  totalModules += blocks.length;
}

const expectedTotal = manifest.counts?.cumulative || verbs.length;
if (verbs.length !== expectedTotal) {
  errors.push(`corpus base divergente: ${verbs.length} != ${expectedTotal}`);
}
if (actualVerbs.size !== expectedTotal) {
  errors.push(`cobertura de extras divergente: ${actualVerbs.size} != ${expectedTotal}`);
}

console.log(`Verbos no corpus: ${verbs.length}`);
console.log(`Verbos com extras: ${actualVerbs.size}/${expectedTotal}`);
console.log(`Overrides editoriais aplicados: ${overriddenVerbs}`);
console.log(`Módulos totais: ${totalModules}`);
console.log(`Com Preposições: ${withPrepositions}`);
console.log(`Com Contraste: ${withContrast}`);

if (errors.length) {
  console.error('\nERROS');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('\nValidação dos extras concluída sem erros');
