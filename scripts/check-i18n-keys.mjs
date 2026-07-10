import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../src/i18n/resources', import.meta.url));
const BASE_LANG = 'ko';
const CHECK_LANGS = ['en'];

function flattenKeys(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenKeys(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const namespaces = readdirSync(join(ROOT, BASE_LANG))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

const failures = [];

for (const namespace of namespaces) {
  const basePath = join(ROOT, BASE_LANG, `${namespace}.json`);
  const baseKeys = new Set(flattenKeys(readJson(basePath)));

  for (const lang of CHECK_LANGS) {
    const targetPath = join(ROOT, lang, `${namespace}.json`);
    let targetKeys;
    try {
      targetKeys = new Set(flattenKeys(readJson(targetPath)));
    } catch (error) {
      failures.push(`${lang}/${namespace}.json: missing namespace (${error.message})`);
      continue;
    }

    for (const key of baseKeys) {
      if (!targetKeys.has(key)) failures.push(`${lang}/${namespace}.json: missing key ${key}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`i18n key coverage OK: ${CHECK_LANGS.join(', ')} match ${BASE_LANG}`);
