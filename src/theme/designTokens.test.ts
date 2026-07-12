import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHART_CSS_VARIABLES,
  COLOR_CSS_VARIABLES,
  FUNCTIONAL_COLORS,
  GENERATED_DEFAULT_SCHEME,
} from './generated';

const root = resolve(import.meta.dirname, '../..');

describe('generated design tokens', () => {
  it('light and dark variants have complete, matching contracts', () => {
    expect(Object.keys(GENERATED_DEFAULT_SCHEME.light.colors).sort())
      .toEqual(Object.keys(GENERATED_DEFAULT_SCHEME.dark.colors).sort());
    expect(Object.keys(GENERATED_DEFAULT_SCHEME.light.chartColors).sort())
      .toEqual(Object.keys(GENERATED_DEFAULT_SCHEME.dark.chartColors).sort());
    expect(new Set(Object.values(COLOR_CSS_VARIABLES)).size).toBe(Object.keys(COLOR_CSS_VARIABLES).length);
    expect(new Set(Object.values(CHART_CSS_VARIABLES)).size).toBe(Object.keys(CHART_CSS_VARIABLES).length);
  });

  it('keeps map colors in a functional namespace instead of brand accent', () => {
    expect(FUNCTIONAL_COLORS.map.recordedTrack).toBe('#FC5200');
    expect(FUNCTIONAL_COLORS.map.plannedRoute).toBe('#AB47BC');
    expect(FUNCTIONAL_COLORS.map.recordedTrack).not.toBe(GENERATED_DEFAULT_SCHEME.light.colors.accent);
  });

  it('generated FOUC CSS contains the exact default theme values', () => {
    const css = readFileSync(resolve(root, 'src/theme/generated.css'), 'utf8');
    for (const [key, variable] of Object.entries(COLOR_CSS_VARIABLES)) {
      expect(css).toContain(`${variable}: ${GENERATED_DEFAULT_SCHEME.light.colors[key]};`);
      expect(css).toContain(`${variable}: ${GENERATED_DEFAULT_SCHEME.dark.colors[key]};`);
    }
  });

  it('generator check mode is deterministic and current', () => {
    expect(() => execFileSync(process.execPath, ['scripts/gen-design-tokens.mjs', '--check'], { cwd: root }))
      .not.toThrow();
  });

  it('rejects missing functional keys, incomplete mappings, and CSS collisions', () => {
    const base = JSON.parse(readFileSync(resolve(root, 'design-tokens/orider.tokens.json'), 'utf8'));
    const invalid = [
      (value: any) => { delete value.functionalColors.map.plannedRoute; },
      (value: any) => { delete value.cssVariables.colors.background; },
      (value: any) => { value.cssVariables.colors.background = value.cssVariables.colors.surface; },
    ];
    const dir = mkdtempSync(resolve(tmpdir(), 'orider-token-invalid-'));
    try {
      for (const [index, mutate] of invalid.entries()) {
        const value = structuredClone(base);
        mutate(value);
        const source = resolve(dir, `${index}.json`);
        writeFileSync(source, JSON.stringify(value));
        const result = spawnSync(process.execPath, ['scripts/gen-design-tokens.mjs', '--check', '--source', source, '--output-dir', resolve(dir, 'out')], { cwd: root });
        expect(result.status).not.toBe(0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('check detects stale output without mutating tracked generated files', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'orider-token-stale-'));
    try {
      execFileSync(process.execPath, ['scripts/gen-design-tokens.mjs', '--output-dir', dir], { cwd: root });
      const generated = resolve(dir, 'generated.ts');
      writeFileSync(generated, `${readFileSync(generated, 'utf8')}\n// stale\n`);
      const result = spawnSync(process.execPath, ['scripts/gen-design-tokens.mjs', '--check', '--output-dir', dir], { cwd: root });
      expect(result.status).not.toBe(0);
      expect(result.stderr.toString()).toContain('generated files are stale');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
