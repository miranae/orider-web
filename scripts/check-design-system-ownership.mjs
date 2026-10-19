#!/usr/bin/env node
/** Feature CSS must not redefine shared control presentation. Existing exceptions are frozen. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED = /\.ds-(?:btn|chart|toolbar|map|toggle|control|section|data-table|combo-chart|segment-timeline|reference-gauge|before-after)(?=[\w-]*\b)/;

// Preserve strings (including URLs) while dropping comments. Braces in quoted content are not blocks.
function withoutComments(source) {
  let result = '', quote = '', comment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index], next = source[index + 1];
    if (comment) { if (char === '*' && next === '/') { comment = false; index++; result += ' '; } continue; }
    if (quote) { result += char; if (char === '\\') result += source[++index] ?? ''; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    if (char === '/' && next === '*') { comment = true; index++; continue; }
    result += char;
  }
  return result;
}

/** Pure scanner, also used by the guard regression tests. */
export function scanControlOverrides(path, source) {
  const clean = withoutComments(source), records = [], stack = [];
  let start = 0, quote = '';
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') {
      const selector = clean.slice(start, index).trim();
      stack.push({ selector, declarations: '', context: stack.map(item => item.selector).join(' > ') });
      start = index + 1;
    } else if (char === '}') {
      const block = stack.pop();
      if (!block) throw new Error(`${path}: unmatched CSS brace`);
      block.declarations += clean.slice(start, index);
      const selector = [block.context, block.selector].filter(Boolean).join(' > ').replace(/\s+/g, ' ');
      const declarations = block.declarations.trim().replace(/\s+/g, ' ');
      if (PROTECTED.test(selector) && declarations) records.push({ path, selector, fingerprint: createHash('sha256').update(`${selector}\n${declarations}`).digest('hex') });
      start = index + 1;
    } else if (char === ';') {
      if (stack.length) stack.at(-1).declarations += clean.slice(start, index + 1);
      start = index + 1;
    }
  }
  if (stack.length) throw new Error(`${path}: unmatched CSS brace`);
  return records;
}

export function findNewOverrides(records, baseline) {
  const allowed = new Map();
  for (const item of baseline) {
    const key = JSON.stringify(item);
    allowed.set(key, (allowed.get(key) ?? 0) + 1);
  }
  return records.filter(item => {
    const key = JSON.stringify(item), count = allowed.get(key) ?? 0;
    if (!count) return true;
    allowed.set(key, count - 1);
    return false;
  });
}

export function collectControlOverrides(root) {
  const records = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = resolve(directory, entry.name), path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('.css') && !path.startsWith('src/theme/components/')) records.push(...scanControlOverrides(path, readFileSync(absolute, 'utf8')));
    }
  }
  visit(resolve(root, 'src'));
  return records;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const baseline = JSON.parse(readFileSync(resolve(root, 'scripts/design-system-ownership-baseline.json'), 'utf8'));
  const violations = findNewOverrides(collectControlOverrides(root), baseline);
  if (violations.length) {
    console.error('Design system ownership: feature CSS cannot redefine shared controls. Add a component variant in src/theme/components instead.');
    for (const violation of violations) console.error(`${violation.path}: ${violation.selector}`);
    process.exitCode = 1;
  } else console.log(`Design system ownership: PASS (${baseline.length} frozen legacy rules; new overrides: 0).`);
}
