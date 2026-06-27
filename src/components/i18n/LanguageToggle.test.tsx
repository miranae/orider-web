import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LanguageToggle } from './LanguageToggle';
import { LocaleProvider } from '../../contexts/LocaleContext';

vi.mock('../../services/firebase', () => ({ firestore: {}, auth: {} }));
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

  it('clicking EN calls i18n.changeLanguage with "en"', async () => {
    render(
      <MemoryRouter initialEntries={['/ko/dashboard']}>
        <Routes>
          <Route path="/:lang/dashboard" element={
            <LocaleProvider userId={null}>
              <LanguageToggle variant="header" />
            </LocaleProvider>
          } />
        </Routes>
      </MemoryRouter>
    );
    const en = screen.getByRole('button', { name: /EN/i });
    await act(async () => { en.click(); });
    const i18n = (await import('../../i18n')).default as any;
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
  });
});
