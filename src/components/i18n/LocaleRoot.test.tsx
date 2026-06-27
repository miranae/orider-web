import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LocaleRoot } from './LocaleRoot';

vi.mock('../../i18n', () => ({
  default: { language: 'ko', changeLanguage: vi.fn() },
}));

beforeEach(() => {
  // Force fallback to 'ko' deterministically (no localStorage, ko navigator)
  try { localStorage.removeItem('i18nextLng'); } catch {}
  Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
});

describe('LocaleRoot', () => {
  it('renders outlet for valid lang', () => {
    render(
      <MemoryRouter initialEntries={['/en/x']}>
        <Routes>
          <Route path="/:lang" element={<LocaleRoot />}>
            <Route path="x" element={<div>child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('redirects unsupported lang code to /ko (strip prefix)', () => {
    render(
      <MemoryRouter initialEntries={['/fr/x']}>
        <Routes>
          <Route path="/:lang" element={<LocaleRoot />}>
            <Route path="x" element={<div>fr-child</div>} />
          </Route>
          <Route path="/ko/x" element={<div>ko-fallback</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('ko-fallback')).toBeInTheDocument();
  });

  it('preserves path when first segment is not a lang code (e.g. /settings)', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/:lang" element={<LocaleRoot />}>
            <Route index element={<div>lang-only</div>} />
          </Route>
          <Route path="/ko/settings" element={<div>ko-settings</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('ko-settings')).toBeInTheDocument();
  });
});
