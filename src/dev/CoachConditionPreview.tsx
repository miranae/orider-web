import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Activity } from '@shared/types';
import type { SufficiencyBlock, SufficiencySet } from '@shared/types/sufficiency';
import type { ActivityImpactEntry } from '../features/fitness/activityImpact';
import FitnessCoachBriefing from '../features/fitness/components/FitnessCoachBriefing';
import PmcHistoryPanel from '../features/fitness/components/PmcHistoryPanel';
import TrainingStatusCard from '../components/fitness/TrainingStatusCard';
import LoadQualityEvidence from '../features/sufficiency/LoadQualityEvidence';
import { Text, ToggleControls, ToggleButton } from '../theme';
import '../pages/FitnessPage.css';
import '../i18n';

const points = Array.from({ length: 90 }, (_, i) => ({ date: new Date(Date.UTC(2026, 6, 30 + i)).toISOString().slice(0, 10), ctl: 34 + i / 6, atl: 38 + i / 8 + Math.sin(i / 4) * 7, tsb: -4 + i / 24 - Math.sin(i / 4) * 7, dailyLoad: i % 3 === 0 ? 90 : 0, loadStatus: 'final' as const, calculationStatus: 'server' as const }));
const block: SufficiencyBlock = { featureId: 'load_history', viewId: 'current', discipline: 'bike', state: 'low_evidence', requirements: [{ requirementId: 'load_quality', kind: 'quality', satisfaction: 'not_met', guarantee: 'unpredictable' }], remainingRequirementCount: 1, nextAction: null, source: { basis: 'measured', assumedInputs: [] } };
const set: SufficiencySet = { schemaVersion: 1, catalogVersion: 'pdc-sufficiency-v1', ownerOutput: 'pdc_bike', subjectKey: 'synthetic', asOf: Date.UTC(2026, 9, 27), computedAt: Date.UTC(2026, 9, 27), staleAfter: null, digest: 'synthetic', blocks: [block] };
const impacts: ActivityImpactEntry[] = [160, 80, 120].map((load, i) => ({ activity: { id: `example-${i}`, type: 'Ride', startTime: Date.UTC(2026, 9, 25 - i * 3), summary: { distance: load * 500, tss: load, ridingTimeMillis: 7200000 } } as Activity, date: `2026-10-${25 - i * 3}`, attributedLoad: load, canonicalDailyLoad: load, confidence: 'canonical-single', marginalImpact: { ctl: load / 42, atl: load / 7, tsb: load / 42 - load / 7 }, actualDayChange: { ctl: 1, atl: 5, tsb: -4 }, daysSince: i * 3, remainingContribution: { ctl: 1, atl: 2, tsb: -1 } }));
export default function CoachConditionPreview() {
  const [selected, select] = useState('example-0');
  const [mode, setMode] = useState<'trend' | 'years'>('trend');
  return <MemoryRouter initialEntries={['/ko/coach/condition']}><FitnessCoachBriefing part="condition" impacts={impacts} selectedActivityId={selected} onSelectActivity={select} forecast={null} current={{ ctl: 48.5, atl: 48.2, tsb: 0.2 }} decisionSlot={null} locale="ko-KR" canonicalAvailable discipline="bike" showConditionChoices={false}
    statusSlot={<><Text as="p" variant="eyebrow">현재 컨디션 · 생성 예시</Text><TrainingStatusCard embedded presentation="story" ctl={48.5} atl={48.2} tsb={0.2} sport="bike" /></>}
    currentBasis="2026-10-27 기준 · 생성한 훈련 이력"
    metricsNoteSlot={<LoadQualityEvidence points={points} set={set} block={block} testId="catalog-load-quality" />}
    trendSlot={<section className="condition-trend-region"><ToggleControls variant="axis" aria-label="차트 보기"><ToggleButton selected={mode === 'trend'} onClick={() => setMode('trend')}>장기 추이</ToggleButton><ToggleButton selected={mode === 'years'} onClick={() => setMode('years')}>연도별 비교</ToggleButton></ToggleControls><PmcHistoryPanel points={points} today="2026-10-27" canonical controlledMode={mode} hideModeControls suppressMethodNotes /></section>}
  /></MemoryRouter>;
}
