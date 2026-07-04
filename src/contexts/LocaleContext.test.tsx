import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider, useLocale } from './LocaleContext';

vi.mock('../services/firebase', () => ({
  firestore: {},
  auth: {},
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

function Probe() {
  const { locale, units } = useLocale();
  return <div>{locale}/{units}</div>;
}

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
});
