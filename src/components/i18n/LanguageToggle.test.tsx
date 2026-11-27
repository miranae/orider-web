import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LanguageToggle } from './LanguageToggle';
import { LocaleProvider } from '../../contexts/LocaleContext';

vi.mock('../../services/firebase', () => ({
  // useFirebaseServices() 기본 컨텍스트가 이 모듈 전체를 읽는다 (#847).
  firestore: {},
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
  getAppCheckToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock('../../i18n', () => ({
  default: { language: 'ko', changeLanguage: vi.fn().mockResolvedValue(undefined) },
}));

describe('LanguageToggle', () => {
  it('renders ko/en options in header variant', () => {
    render(
      <MemoryRouter initialEntries={['/ko/x']}>
        <Routes>
          <Route path="/:lang/x" element={
            <LocaleProvider userId={null}>
              <LanguageToggle variant="header" />
            </LocaleProvider>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /KO/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /EN/i })).toBeInTheDocument();
  });

  it.each([
    ['English', 'en'],
    ['日本語', 'ja'],
    ['繁體中文（台灣）', 'zh-TW'],
    ['Português (Brasil)', 'pt-BR'],
    ['Español', 'es'],
  ])('switches to %s and preserves the current URL', async (name, code) => {
    function CurrentUrl() {
      const { pathname, search, hash } = useLocation();
      return <output>{pathname}{search}{hash}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/ko/dashboard?view=week#summary']}>
        <Routes>
          <Route path="/:lang/dashboard" element={
            <LocaleProvider userId={null}>
              <LanguageToggle />
              <CurrentUrl />
            </LocaleProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => { screen.getByRole('radio', { name }).click(); });
    const i18n = (await import('../../i18n')).default;
    expect(i18n.changeLanguage).toHaveBeenCalledWith(code);
    expect(screen.getByText('/' + code + '/dashboard?view=week#summary')).toBeInTheDocument();
  });
});
