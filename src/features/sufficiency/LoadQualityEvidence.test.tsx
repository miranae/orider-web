import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../__tests__/utils/renderWithProviders';
import { sufficiencyBlock, sufficiencySet } from './__fixtures__';
import LoadQualityEvidence from './LoadQualityEvidence';

describe('independent update and quality evidence', () => {
  it('shows history progress before the saved assessment without replacing quality with progress', () => {
    const block = sufficiencyBlock({ featureId: 'load_history', state: 'low_evidence', nextAction: null, requirements: [{ requirementId: 'load_quality', kind: 'quality', satisfaction: 'not_met', guarantee: 'unpredictable' }] });
    renderWithProviders(<LoadQualityEvidence set={sufficiencySet([block])} block={block} testId="quality" points={[{ date: '2026-10-15', ctl: null, atl: null, tsb: null, dailyLoad: 0, calculationStatus: 'pending' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('훈련 부하 반영 대기');
    const details = screen.getByText('데이터 품질과 근거').closest('summary')!;
    expect(details.parentElement).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('낮은 근거');
    fireEvent.click(details);
    const evidence = screen.getByTestId('quality');
    expect(evidence).toHaveTextContent('품질 평가 기준 시점');
    expect(evidence).toHaveTextContent('부하 산정 방식 · 추정 또는 혼합 부하 포함');
    expect(screen.getByRole('status').compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence).not.toHaveTextContent('남은 요건');
  });
});
