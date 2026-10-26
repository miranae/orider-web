import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../__tests__/utils/renderWithProviders';
import { criticalDistribution, PowerZoneReadings } from './PowerZoneReadings';
import { ZoneTimeBar } from './ActivityOverviewCharts';
const bands = [
  { label: 'Sweet Spot', range: '83–95% FTP', seconds: 20, color: 'var(--zone-3)' },
  { label: 'Threshold', range: '95–106% FTP', seconds: 10, color: 'var(--zone-4)' },
  { label: 'VO2max', range: '106–120% FTP', seconds: 5, color: 'var(--zone-5)' },
  { label: 'Anaerobic', range: '>120% FTP', seconds: 5, color: 'var(--zone-6)' },
];
describe('power distribution reading', () => {
  it('retains the unclassified time instead of inflating four FTP bands to 100%', () => {
    expect(criticalDistribution(bands, [70, 30])).toEqual({ total: 100, remainder: 60 });
    expect(criticalDistribution(bands, [30])).toBeNull();
    expect(criticalDistribution(bands.slice(0, 3), [100])).toBeNull();
    expect(criticalDistribution(bands, undefined)).toBeNull();
    expect(criticalDistribution(bands, [NaN])).toBeNull();
  });
  it('reveals the Seiler range by tap, keyboard focus and Escape; retains zero categories', () => {
    renderWithProviders(<PowerZoneReadings seiler={[{ zone: 1, label: '', seconds: 60, pct: 60, color: 'var(--zone-2)' }, { zone: 2, label: '', seconds: 0, pct: 0, color: 'var(--zone-4)' }, { zone: 3, label: '', seconds: 40, pct: 40, color: 'var(--zone-5)' }]} bands={bands} powerSeconds={[100]} />);
    const high = screen.getAllByRole('button', { name: /고강도 ·/ }).at(-1)!;
    fireEvent.click(high);
    expect(screen.getByRole('tooltip')).toHaveTextContent('FTP 100% 이상 · Z4 일부–Z7');
    fireEvent.keyDown(high, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(high);
    expect(screen.getByRole('tooltip')).toHaveTextContent('40.0%');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /역치 · 0:00/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'FTP 기준 영역' })).toBeInTheDocument();
  });
  it('keeps zero work and missing work distinct in the only zone table', () => {
    renderWithProviders(<ZoneTimeBar layout="rows" heading="이번 활동" zone={{ kind: 'power', seconds: [30, 30], currentPercentages: [50, 50], priority: 'primary' }} workKj={[0, undefined]} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'kJ' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '0', exact: true })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '—' })).toBeVisible();
  });
});
