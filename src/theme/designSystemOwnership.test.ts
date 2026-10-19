import { describe, expect, it } from 'vitest';

// Keep the production guard directly under test; no parallel scanner implementation.
const modulePath = '../../scripts/check-design-system-ownership.mjs';
const { scanControlOverrides, findNewOverrides } = await import(modulePath);

describe('shared control CSS ownership', () => {
  it('permits an exact legacy fingerprint and rejects a changed declaration or file', () => {
    const legacy = scanControlOverrides('src/old.css', '.old .ds-btn { color: var(--ink-1); }');
    expect(findNewOverrides(legacy, legacy)).toEqual([]);
    expect(findNewOverrides(scanControlOverrides('src/old.css', '.old .ds-btn { color: var(--ink-2); }'), legacy)).toHaveLength(1);
    expect(findNewOverrides(scanControlOverrides('src/new.css', '.old .ds-btn { color: var(--ink-1); }'), legacy)).toHaveLength(1);
  });

  it('catches protected controls in multiline selectors and nested media rules', () => {
    const records = scanControlOverrides('src/new.css', `@media (max-width: 40rem) {
      .page .ds-map-resize,
      .page .ds-toggle-button[aria-pressed="true"] { border: 0; }
    }`);
    expect(records).toHaveLength(1);
    expect(records[0].selector).toContain('@media');
  });

  it('does not mistake comments or quoted content for selectors or braces', () => {
    expect(scanControlOverrides('src/new.css', `/* .ds-btn { color: red; } */
      .feature { content: ".ds-btn { }"; background: url("https://example.test/a/*b*/"); }
    `)).toEqual([]);
  });

  it('catches nested overrides inherited from a protected selector', () => {
    expect(scanControlOverrides('src/new.css', '.page .ds-chart { &:hover { color: var(--ink-1); } }')).toHaveLength(1);
  });

  it('does not grandfather an extra copy of an allowed rule', () => {
    const legacy = scanControlOverrides('src/old.css', '.old .ds-btn { color: var(--ink-1); }');
    expect(findNewOverrides([...legacy, ...legacy], legacy)).toHaveLength(1);
  });

  it('leaves feature layout selectors and unprotected primitives alone', () => {
    expect(scanControlOverrides('src/new.css', '.feature-actions { display: flex; } .ds-card { margin: 0; }')).toEqual([]);
    expect(scanControlOverrides('src/new.css', '.feature .ds-toolbar-button { min-height: 1rem; }')).toHaveLength(1);
  });
  it('rejects page overrides for sections, data tables and mixed charts without extending legacy exceptions', () => {
    for (const selector of ['.page .ds-section__title', '.page .ds-data-table th', '.page .ds-combo-chart__plot', '.page .ds-segment-timeline__track', '.page .ds-reference-gauge__marker', '.page .ds-before-after__values']) {
      const records = scanControlOverrides('src/new.css', `${selector} { color: var(--accent); }`);
      expect(findNewOverrides(records, [])).toHaveLength(1);
    }
  });

});
