import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { LocaleProvider, useLocale } from './LocaleContext';
import { AUTO_LOCALE_REDIRECT_KEY } from '../i18n/detector';

vi.mock('../services/firebase', () => ({
  // LocaleProvider 가 useFirebaseServices() 로 받게 바뀌면서(#847) 기본 컨텍스트가
  // 이 모듈 전체를 읽는다 — functions/ensureAppCheckReady 까지 있어야 한다.
  firestore: {},
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

function Probe() {
  const { locale, units } = useLocale();
  return <div>{locale}/{units}</div>;
}

beforeEach(() => {
  sessionStorage.removeItem(AUTO_LOCALE_REDIRECT_KEY);
  window.history.replaceState(null, '', '/');
});

describe('LocaleContext', () => {
  it('provides defaults', () => {
    render(
      <LocaleProvider userId={null}>
        <Probe />
      </LocaleProvider>
    );
    expect(screen.getByText(/ko\/metric|en\/metric/)).toBeInTheDocument();
  });

  it('setUnits updates state', async () => {
    function Toggle() {
      const { units, setUnits } = useLocale();
      return <button onClick={() => setUnits('imperial')}>{units}</button>;
    }
    render(
      <LocaleProvider userId={null}>
        <Toggle />
      </LocaleProvider>
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('metric');
    await act(async () => { btn.click(); });
    expect(btn).toHaveTextContent('imperial');
  });

  it('uses locale and units from the auth profile without a second Firestore listener', () => {
    render(
      <LocaleProvider userId="test-uid" profile={{ locale: 'en', units: 'imperial' }}>
        <Probe />
      </LocaleProvider>
    );
    expect(screen.getByText('en/imperial')).toBeInTheDocument();
  });

  it('replaces an automatic URL language prefix with the auth profile locale', async () => {
    window.history.replaceState(null, '', '/en/settings');
    sessionStorage.setItem(
      AUTO_LOCALE_REDIRECT_KEY,
      JSON.stringify({ target: '/en/settings', lang: 'en' })
    );

    render(
      <LocaleProvider userId="test-uid" profile={{ locale: 'ko' }}>
        <Probe />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('ko/metric')).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/ko/settings');
  });
});
