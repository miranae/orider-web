import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Crosshair, Minus, Plus, Search } from 'lucide-react';
import {
  Button, IconButton, Checkbox, Card, Section, Select, Field, Input, DataTable, ComboChart, Text, ToggleControls, ToggleButton,
  Chip, ChartRangeControls, type ChartRangeMode, SegmentTimeline, ReferenceGauge, BeforeAfterPlot,
  type DataTableColumn,
  MapResizeControls, MapNavigation, MapControlButton, ChartLegend, ChartValue, ChartTooltip,
  ComparisonChart, CHART_PRESENTATION, DEFAULT_THEME,
} from '../theme';
import { panChartRange } from '../theme/charts/chartViewport';
import InfoTip from '../components/InfoTip';
import SportIcon from '../components/common/SportIcon';
import { COLOR_CSS_VARIABLES, CHART_CSS_VARIABLES, DIMENSION_CSS_VARIABLES } from '../theme/generated';
import { getComparisonSeriesColors } from '../theme/charts/comparisonSeriesColors';
import {
  FIXTURE_METRICS, FIXTURE_RECORDS, fixtureCoordinate, fixtureDomain, fixtureNearest,
  fixtureObservedMean, fixtureRoute, fixtureRoutePath, type FixtureMetric,
  FIXTURE_SUMMARY_ROWS, FIXTURE_COMBO_SAMPLES, sortFixtureSummaries,
  type FixtureSummaryRow, type FixtureSummarySortKey,
} from './designSystemFixture';
import '../theme/generated.css';
import '../theme/components/components.css';
import './designSystemControls.css';

/** Consume the live theme, without saving app preferences or copying token values. */
function previewTokens(mode: 'light' | 'dark'): CSSProperties {
  const variant = DEFAULT_THEME.scheme[mode];
  const values: Record<string, string> = {};
  for (const [key, variable] of Object.entries(COLOR_CSS_VARIABLES)) values[variable] = variant.colors[key as keyof typeof variant.colors];
  for (const [key, variable] of Object.entries(CHART_CSS_VARIABLES)) values[variable] = variant.chartColors[key as keyof typeof variant.chartColors];
  for (const [key, variable] of Object.entries(DIMENSION_CSS_VARIABLES)) values[variable] = `${DEFAULT_THEME.dimens[key as keyof typeof DEFAULT_THEME.dimens]}px`;
  for (const [key, token] of Object.entries(DEFAULT_THEME.typography)) {
    const name = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    values[`--ft-${name}-size`] = `${token.size}px`;
    values[`--ft-${name}-weight`] = String(token.weight);
    if (token.lineHeight) values[`--ft-${name}-line-height`] = String(token.lineHeight);
  }
  return values as CSSProperties;
}

const SECTIONS = [['adoption', '사용 원칙'], ['cards', '카드와 섹션'], ['buttons', '버튼'], ['selection', '선택 컨트롤'], ['sport-icons', '종목 아이콘'], ['tables', '표'], ['combo', '복합 차트'], ['analysis-controls', '분석 컨트롤'], ['composition', '기록 비교'], ['states', '상태와 접근성']] as const;
const VARIANTS = [
  { id: 'primary', name: '주요 동작', label: '변경 사항 저장', usage: '한 영역에서 가장 중요한 실행 동작' },
  { id: 'secondary', name: '보조 동작', label: '미리보기', usage: '관련된 다른 실행 동작' },
  { id: 'ghost', name: '가벼운 동작', label: '수정하기', usage: '콘텐츠 옆의 보조 도구' },
  { id: 'outline', name: '경계가 필요한 동작', label: '파일 선택', usage: '주변 표면과 구분해야 하는 도구' },
  { id: 'danger', name: '삭제 동작', label: '기록 삭제', usage: '결과를 되돌리기 어려운 실행 동작' },
] as const;
const COMBO_AXES = { left: { label: '파워', unit: 'W' }, right: { label: '심박수', unit: 'bpm' } };
const COMBO_DOMAIN = [0, 90] as const;
const COMBO_LABELS = {
  chart: '예시 파워 막대와 심박수 선 복합 차트', legend: '복합 차트 지표 표시',
  empty: '표시할 표본이 없습니다. 지표를 켜거나 예시 차트를 복원하세요.',
  keyboardHint: '차트를 선택한 뒤 ←·→, Home·End로 표본을 이동하고 Escape로 선택을 해제하세요.',
};
const ANALYSIS_IF_DOMAIN = [0.4, 1.3] as const;
const ANALYSIS_IF_TICKS = [{ value: .55, label: '0.55' }, { value: .75, label: '0.75', compact: true }, { value: .9, label: '0.90' }, { value: 1.05, label: '1.05', compact: true }, { value: 1.2, label: '1.20' }];
const ANALYSIS_FITNESS_DOMAIN = [-26, 70] as const;
const ANALYSIS_FITNESS = [
  { id: 'ctl', label: '체력 · CTL', from: 42, to: 43.2 },
  { id: 'atl', label: '피로 · ATL', from: 58, to: 62.5 },
  { id: 'tsb', label: '상태 · TSB', from: -16, to: -19.3 },
];
const clock = (minutes: number) => {
  const rounded = Math.round(minutes), hour = 9 + Math.floor(rounded / 60);
  return `${String(hour).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
};
const clockExact = (minutes: number) => {
  const seconds = Math.round(minutes * 60);
  return `${String(9 + Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const chartLabels = {
  controls: '예시 차트 조작', panRange: '구간 이동', panHint: '확대한 구간을 좌우로 드래그하거나 이동 버튼에서 방향키를 누르세요.', panUnavailable: '구간을 선택하면 이동할 수 있어요.',
  selectRange: '구간 선택', selectRangeShort: '구간 선택', reset: '초기화',
  rangeHint: '차트를 좌우로 드래그해 확대할 구간을 선택하세요.', empty: '표시할 지표가 없습니다. 위에서 지표를 선택하세요.',
};

function ControlsCatalog() {
  const [analysisAxis, setAnalysisAxis] = useState<'distance' | 'time'>('time');
  const [analysisMetrics, setAnalysisMetrics] = useState<FixtureMetric[]>(['hr', 'power', 'speed']);
  const [analysisRange, setAnalysisRange] = useState<[number, number] | null>(null);
  const [analysisRangeMode, setAnalysisRangeMode] = useState<ChartRangeMode>('inspect');
  const analysisRangeSelected = analysisRange !== null;
  const [analysisState, setAnalysisState] = useState<'ready' | 'pending' | 'stale' | 'outside'>('ready');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [sectionRecord, setSectionRecord] = useState(0);
  const [cardSelected, setCardSelected] = useState(false);
  const [recordChecked, setRecordChecked] = useState(true);
  const [tableState, setTableState] = useState<'records' | 'empty' | 'loading'>('records');
  const [tableSort, setTableSort] = useState<{ key: FixtureSummarySortKey; direction: 'ascending' | 'descending' }>({ key: 'distance', direction: 'descending' });
  const [comboVisible, setComboVisible] = useState<ReadonlySet<string>>(new Set(['power', 'hr']));
  const [comboSelected, setComboSelected] = useState<number | null>(45);
  const [comboEmpty, setComboEmpty] = useState(false);
  const [message, setMessage] = useState('버튼을 누르면 여기에 결과를 표시합니다.');
  const [expanded, setExpanded] = useState(false);
  const [camera, setCamera] = useState(1);
  const [axis, setAxis] = useState<'distance' | 'time'>('distance');
  const [metrics, setMetrics] = useState<FixtureMetric[]>(['hr', 'power', 'speed']);
  const [selected, setSelected] = useState<number | null>(18);
  const [viewport, setViewport] = useState<[number, number] | null>(null);
  const [empty, setEmpty] = useState(false);
  const [stateSelected, setStateSelected] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('저장 대기 · 예시');
  const [exampleMetrics, setExampleMetrics] = useState<FixtureMetric[]>(['hr', 'power']);
  const [filterSport, setFilterSport] = useState('all');
  const [exampleAxis, setExampleAxis] = useState<'distance' | 'time'>('distance');
  useEffect(() => { document.documentElement.dataset.theme = mode; }, [mode]);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => { setLoading(false); setSaveStatus('저장 완료 · 예시'); setMessage('예시 저장을 완료했습니다. 실제 데이터는 변경하지 않습니다.'); }, 1000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  const theme = DEFAULT_THEME.scheme[mode];
  const recordColors = useMemo(() => getComparisonSeriesColors(mode), [mode]);
  const domain = useMemo(() => fixtureDomain(axis), [axis]);
  const visibleRange = viewport ?? domain;
  const sortedRows = useMemo(() => sortFixtureSummaries(FIXTURE_SUMMARY_ROWS, tableSort.key, tableSort.direction), [tableSort]);
  const sortHeader = (key: FixtureSummarySortKey, label: string, unit: string) => {
    const active = tableSort.key === key;
    const nextDirection = active && tableSort.direction === 'descending' ? 'ascending' : 'descending';
    return <Button variant="ghost" size="sm" aria-label={`${label} ${nextDirection === 'ascending' ? '오름차순' : '내림차순'} 정렬`} onClick={() => setTableSort({ key, direction: nextDirection })}>{label} ({unit}){active && (tableSort.direction === 'ascending' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}</Button>;
  };
  const summaryColumns: DataTableColumn<FixtureSummaryRow>[] = [
    { id: 'label', header: '활동', rowHeader: true, cell: row => row.label },
    { id: 'distance', sortDirection: tableSort.key === 'distance' ? tableSort.direction : 'none', header: sortHeader('distance', '거리', 'km'), align: 'end', cell: row => row.distance.toFixed(1) },
    { id: 'duration', sortDirection: tableSort.key === 'duration' ? tableSort.direction : 'none', header: sortHeader('duration', '시간', '분'), align: 'end', cell: row => row.duration },
    { id: 'power', sortDirection: tableSort.key === 'power' ? tableSort.direction : 'none', header: sortHeader('power', '평균 파워', 'W'), align: 'end', cell: row => row.power == null ? '—' : row.power.toFixed(0) },
    { id: 'hr', header: '평균 심박수 (bpm)', align: 'end', cell: row => row.hr == null ? '—' : row.hr.toFixed(0) },
    { id: 'speed', header: '평균 속도 (km/h)', align: 'end', cell: row => row.speed == null ? '—' : row.speed.toFixed(1) },
  ];
  const comboSeries = useMemo(() => [
    { id: 'power', label: '파워', color: recordColors[0]!, mark: 'bar' as const, axis: 'left' as const, points: comboEmpty ? [] : FIXTURE_COMBO_SAMPLES.map(sample => ({ x: sample.time, y: sample.power })) },
    { id: 'hr', label: '심박수', color: recordColors[1]!, mark: 'line' as const, axis: 'right' as const, points: comboEmpty ? [] : FIXTURE_COMBO_SAMPLES.map(sample => ({ x: sample.time, y: sample.hr })) },
  ], [recordColors, comboEmpty]);
  const onToggleComboSeries = useCallback((id: string) => setComboVisible(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const comboSample = comboEmpty || comboSelected == null ? null : FIXTURE_COMBO_SAMPLES.reduce((best, sample) => Math.abs(sample.time - comboSelected) < Math.abs(best.time - comboSelected) ? sample : best);
  const analysisZoneColors = [theme.colors.zone1, theme.colors.zone2, theme.colors.zone3, theme.colors.zone4, theme.colors.zone5, theme.colors.zone6];
  const analysisIf = analysisState === 'pending' ? null : analysisState === 'outside' ? 1.44 : .78;
  const analysisBandBoundaries = [.4, .55, .75, .9, 1.05, 1.2, 1.3];
  const analysisMinutes = analysisRange ?? [0, 90];
  const analysisDisplayRange: [number, number] = analysisAxis === 'time' ? [analysisMinutes[0], analysisMinutes[1]] : [analysisMinutes[0] * .36, analysisMinutes[1] * .36];
  const analysisTimelineRows = [{ id: 'power', label: '파워 존', zones: [0, 1, 2, 3, 1, 0] }, { id: 'hr', label: '심박 존', zones: [0, 1, 1, 2, 2, 1] }].map(row => ({
    id: row.id, label: row.label, surface: row.id === 'power' ? 'sheen' as const : 'plain' as const,
    buckets: row.zones.flatMap((zone, index) => {
      const from = Math.max(index * 15, analysisMinutes[0]), to = Math.min((index + 1) * 15, analysisMinutes[1]);
      if (to <= from) return [];
      const first = Math.max(0, Math.min(to, index * 15 + 12) - from), second = to - from - first;
      const convert = (value: number) => (analysisAxis === 'time' ? value : value * .36).toFixed(1);
      return [{ id: `${row.id}-${index}`, label: `${convert(from)}–${convert(to)} ${analysisAxis === 'time' ? '분' : 'km'} · Z${zone + 1} ${first.toFixed(1)}분 · Z${Math.min(5, zone + 1) + 1} ${second.toFixed(1)}분`, weight: to - from,
        segments: [{ weight: first, color: analysisZoneColors[zone] }, { weight: second, color: analysisZoneColors[Math.min(5, zone + 1)] }] }];
    }),
  }));
  const analysisRangeCaption = `${analysisDisplayRange[0].toFixed(1)}–${analysisDisplayRange[1].toFixed(1)} ${analysisAxis === 'time' ? '분' : 'km'}`;
  const analysisSample = fixtureNearest(FIXTURE_RECORDS[0]!, (analysisDisplayRange[0] + analysisDisplayRange[1]) / 2, analysisAxis)!;
  const analysisFitnessRows = ANALYSIS_FITNESS.map(row => ({
    ...row, ariaLabel: `${row.label} · 활동 전 ${row.from.toFixed(1)}, 활동 후 ${row.to.toFixed(1)}, 변화 ${(row.to - row.from >= 0 ? '+' : '')}${(row.to - row.from).toFixed(1)}`, shadeBelowReference: row.id === 'tsb',
    values: <ChartValue primary={`${row.from.toFixed(1)} → ${row.to.toFixed(1)}`} secondary={`변화 ${row.to - row.from >= 0 ? '+' : ''}${(row.to - row.from).toFixed(1)}`} />,
  }));
  const onViewportChange = useCallback((range: [number, number] | null) => setViewport(range), []);
  const formatCoordinate = useCallback((value: number) => axis === 'time' ? clock(value) : `${value.toFixed(1)} km`, [axis]);
  const rangeLabel = useCallback((start: number, end: number) => `현재 구간: ${formatCoordinate(start)}–${formatCoordinate(end)}`, [formatCoordinate]);
  const lanes = useMemo(() => [
    ...FIXTURE_METRICS.filter(metric => metrics.includes(metric.id)).map(metric => ({
      id: metric.id, label: metric.label, unit: metric.unit, beginAtZero: metric.id !== 'hr',
      sampled: metric.id === 'power' || metric.id === 'speed',
      series: empty ? [] : FIXTURE_RECORDS.map((record, index) => ({
        id: record.id, label: record.label, color: recordColors[index]!, borderDash: index === 1 ? [5, 3] : undefined,
        points: record.samples.map(sample => ({ x: fixtureCoordinate(sample, axis), y: sample[metric.id] })),
      })),
    })),
    { id: 'elevation', label: '해발고도', unit: 'm', subdued: true,
      series: empty ? [] : FIXTURE_RECORDS.map((record, index) => ({
        id: record.id, label: record.label, color: recordColors[index]!, borderDash: index === 1 ? [5, 3] : undefined,
        points: record.samples.map(sample => ({ x: fixtureCoordinate(sample, axis), y: sample.elevation })),
      })),
    },
  ], [metrics, axis, empty, recordColors]);
  const routeProgress = (record: typeof FIXTURE_RECORDS[number], value: number) => {
    const start = fixtureCoordinate(record.samples[0]!, axis);
    const end = fixtureCoordinate(record.samples[record.samples.length - 1]!, axis);
    return Math.max(0, Math.min(1, (value - start) / (end - start)));
  };
  const changeAxis = (next: typeof axis) => {
    setAxis(next); setViewport(null); setSelected(null);
  };
  const moveSelection = (key: string) => {
    const step = axis === 'distance' ? 0.18 : 0.5;
    if (key === 'Home') setSelected(visibleRange[0]);
    else if (key === 'End') setSelected(visibleRange[1]);
    else setSelected(Math.min(visibleRange[1], Math.max(visibleRange[0], (selected ?? visibleRange[0]) + (key === 'ArrowLeft' ? -step : step))));
  };

  return <div className="controls-catalog" style={previewTokens(mode)} data-preview-theme={mode}>
    <a className="catalog-skip" href="#catalog-content">본문으로 이동</a>
    <header className="catalog-topbar">
      <a href="#adoption" className="catalog-brand">ORider <span>Design</span></a>
      <ToggleControls variant="axis" aria-label="미리보기 테마">
        {(['light', 'dark'] as const).map(value => <ToggleButton key={value} selected={mode === value} onClick={() => setMode(value)}>{value === 'light' ? '라이트' : '다크'}</ToggleButton>)}
      </ToggleControls>
    </header>
    <div className="catalog-layout">
      <nav className="catalog-nav" aria-label="디자인 시스템 목차">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        <a href="/design-system.html" className="catalog-foundation-link">토큰 참고 <ArrowUpRight aria-hidden="true" /></a>
      </nav>
      <main id="catalog-content" className="catalog-content">
        <section id="adoption" className="catalog-section catalog-introduction">
          <Text as="p" variant="eyebrow" tone="tertiary">웹 디자인 시스템 · 실물 정본</Text>
          <Text as="h1" variant="pageTitle">일관된 컨트롤, 자연스러운 탐색.</Text>
          <Text as="p" variant="bodyLarge">Apple의 명확한 위계와 익숙한 조작을 바탕으로, ORider의 브랜드 색을 더합니다.</Text>
          <Text as="p" variant="body" tone="tertiary">제품과 같은 React 컴포넌트입니다. 아래 지도와 기록은 생성한 예시이며, 로그인·서버 요청·실제 데이터 변경이 없습니다.</Text>
          <div className="catalog-adoption-grid">
            <div><Text as="h2" variant="subtitle">실행 · 선택 · 탐색을 구분합니다.</Text><Text as="p" variant="bodySmall">실행은 Button, 여러 지표 선택은 체크 토글, 하나의 기준 선택은 분절 컨트롤을 씁니다. 지도의 영역 크기와 카메라 배율은 분리합니다.</Text></div>
            <div><Text as="h2" variant="subtitle">외형은 컴포넌트가 소유합니다.</Text><Text as="p" variant="bodySmall">페이지는 배치와 데이터만 관리합니다. 색·높이·테두리를 페이지 CSS로 덮지 않고, 공통 variant를 확장합니다.</Text></div>
          </div>
          <pre className="catalog-code"><code>{"import { Button, Card, Section, DataTable, ComparisonChart, ComboChart } from '../theme';"}</code></pre>
          <Text as="p" variant="bodySmall" tone="tertiary">API와 variant 사용법: <code>src/theme/components/README.md</code>. 구현 정본: <code>src/theme/components/</code>. Button·Card·Section·DataTable·ComparisonChart·ComboChart를 공개 export에서 가져오고, 데이터·선택·지도 카메라 상태는 소비자가 관리합니다.</Text>
          <Text as="p" variant="bodySmall" tone="tertiary">현재 적용: 같이한 활동의 지도·차트와 활동 상세의 지도 컨트롤. 동결한 기존 CSS 예외 126개는 이번 정리 범위 밖이며, 새 예외를 추가하지 않습니다.</Text>
        </section>

        <section id="cards" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">카드와 섹션</Text><Text as="p" variant="body" tone="tertiary">카드는 독립된 콘텐츠를, 섹션은 이어지는 정보의 순서와 위계를 만듭니다.</Text></div>
          <div className="catalog-card-grid">
            <div className="catalog-card-example"><div className="catalog-example-label"><Text variant="label">default · 독립 콘텐츠</Text><code>Card</code></div><Card title="강변 아침 라이딩" sub="생성한 예시"><div className="catalog-card-content"><Text variant="dataMedium">32.4 <Text variant="unit">km</Text></Text><Text as="p" variant="bodySmall" tone="tertiary">90분 · 평탄한 강변 왕복 코스</Text><Button variant="ghost" size="sm" aria-pressed={cardSelected} onClick={() => setCardSelected(!cardSelected)}>{cardSelected ? '선택 해제' : '활동 선택'}</Button><Text as="p" variant="caption" tone="tertiary" role="status">{cardSelected ? '이 활동을 선택했습니다.' : '활동을 선택하면 여기에 표시합니다.'}</Text></div></Card></div>
            <div className="catalog-card-example"><div className="catalog-example-label"><Text variant="label">flat · 가벼운 묶음</Text><code>Card variant="flat"</code></div><Card variant="flat" title="내일의 그룹 라이딩"><div className="catalog-card-content"><Text variant="body">09:00 · 공원 입구에서 출발</Text><Text as="p" variant="bodySmall" tone="tertiary">가볍게 몸을 푸는 회복 라이딩 · 3명 예정</Text><Text variant="caption" tone="tertiary">생성한 일정 예시</Text></div></Card></div>
            <div className="catalog-card-example"><div className="catalog-example-label"><Text variant="label">inset · 보조 내용</Text><code>Card variant="inset"</code></div><Card variant="inset" padding="compact" title="라이딩 메모"><div className="catalog-card-content"><Text as="p" variant="body">후반 오르막에서 힘을 아끼고, 마지막 평지에서 일정한 페이스를 유지했습니다.</Text><Text variant="caption" tone="tertiary">생성한 개인 메모 예시</Text></div></Card></div>
            <div className="catalog-card-example"><div className="catalog-example-label"><Text variant="label">bare · 자식이 여백을 관리</Text><code>Card variant="bare"</code></div><Card variant="bare"><svg className="catalog-card-route" viewBox="0 0 600 264" role="img" aria-label="생성한 예시 경로 미리보기"><path d={fixtureRoutePath()} fill="none" stroke={recordColors[0]} strokeWidth="4" /></svg><div className="catalog-card-payload"><Text as="h3" variant="subtitle">경로 미리보기</Text><Text as="p" variant="bodySmall" tone="tertiary">카드의 표면과 테두리는 유지합니다. 내부 여백만 제거해 미디어는 가장자리까지, 설명은 자식의 여백으로 배치합니다.</Text><Text variant="caption" tone="tertiary">생성한 경로 예시 · 서버 요청 없음</Text></div></Card></div>
          </div>
          <div className="catalog-section-demo">
            <Section actionsLayout="responsive" title="훈련 요약" headingLevel={3} description={`${FIXTURE_SUMMARY_ROWS[sectionRecord]!.label} · 생성한 예시`} actions={<Button variant="ghost" size="sm" onClick={() => setSectionRecord(sectionRecord === 0 ? 1 : 0)}>다른 기록 보기</Button>}>
              <div className="catalog-section-metrics"><div><Text as="p" variant="caption" tone="tertiary">평균 파워</Text><Text variant="dataMedium">{FIXTURE_SUMMARY_ROWS[sectionRecord]!.power!.toFixed(0)} <Text variant="unit">W</Text></Text></div><div><Text as="p" variant="caption" tone="tertiary">평균 심박수</Text><Text variant="dataMedium">{FIXTURE_SUMMARY_ROWS[sectionRecord]!.hr!.toFixed(0)} <Text variant="unit">bpm</Text></Text></div><div><Text as="p" variant="caption" tone="tertiary">활동 시간</Text><Text variant="dataMedium">90 <Text variant="unit">분</Text></Text></div></div>
            </Section>
          </div>
          <Text as="p" variant="bodySmall" tone="tertiary">Section은 제목·설명·관련 동작을 같은 기준선에 둡니다. 이어지는 표와 차트까지 매번 카드로 감싸지 않습니다. 소스: <code>src/theme/components/Card.tsx</code> · <code>Section.tsx</code>.</Text>
        </section>

        <section id="buttons" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">버튼</Text><Text as="p" variant="body" tone="tertiary">한 번의 실행을 명확하게. 주요 동작은 한 영역에 하나를 우선합니다.</Text></div>
          <div className="catalog-button-matrix">
            {VARIANTS.map(variant => <div className="catalog-button-row" key={variant.id}>
              <div><Text as="h3" variant="subtitle">{variant.name}</Text><Text as="p" variant="bodySmall" tone="tertiary">{variant.usage}</Text><code>{variant.id}</code></div>
              <Button variant={variant.id} onClick={() => setMessage(`${variant.label} · 예시 동작을 실행했습니다.`)}>{variant.label}</Button>
            </div>)}
          </div>
          <div className="catalog-size-row"><Text variant="label">크기</Text><Button size="sm" onClick={() => setMessage('작은 크기 · 콘텐츠 옆 도구입니다.')}>작게</Button><Button size="md" onClick={() => setMessage('기본 크기 · 일반 동작입니다.')}>기본</Button><Button size="lg" onClick={() => setMessage('큰 크기 · 넉넉한 조작 영역을 제공합니다.')}>크게</Button><Text variant="bodySmall" tone="tertiary">인접한 대안은 같은 크기 · 위계는 variant로 구분</Text></div>
          <p className="catalog-feedback" role="status">{message}</p>
        </section>

        <section id="selection" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">선택 컨트롤</Text><Text as="p" variant="body" tone="tertiary">켜짐은 체크로, 단일 선택은 분절된 표면으로 보여줍니다.</Text></div>
          <div className="catalog-example-row"><div className="catalog-example-note"><Text as="h3" variant="subtitle">여러 지표 선택</Text><Text as="p" variant="bodySmall">단독 상태 예시입니다. 여러 항목을 각각 켜고 끌 수 있으며, 아래 실제 조합과는 별도로 동작합니다.</Text><code>ToggleControls · metric</code></div>
            <ToggleControls aria-label="단독 지표 선택 예시">{FIXTURE_METRICS.map(metric => <ToggleButton key={metric.id} showCheck selected={exampleMetrics.includes(metric.id)} onClick={() => setExampleMetrics(exampleMetrics.includes(metric.id) ? exampleMetrics.filter(value => value !== metric.id) : [...exampleMetrics, metric.id])}>{metric.label}</ToggleButton>)}</ToggleControls>
          </div>
          <div className="catalog-example-row"><div className="catalog-example-note"><Text as="h3" variant="subtitle">하나의 기준 선택</Text><Text as="p" variant="bodySmall">단독 상태 예시입니다. 하나를 선택하면 다른 선택이 해제됩니다. 누적거리는 각 기록의 출발점부터 비교하므로 같은 위치·시각을 보장하지 않습니다.</Text><code>ToggleControls · axis</code></div>
            <ToggleControls variant="axis" aria-label="단독 기준 선택 예시"><ToggleButton selected={exampleAxis === 'distance'} onClick={() => setExampleAxis('distance')}>거리</ToggleButton><ToggleButton selected={exampleAxis === 'time'} onClick={() => setExampleAxis('time')}>실제 시각</ToggleButton></ToggleControls>
          </div>
          <div className="catalog-example-row"><div className="catalog-example-note"><Text as="h3" variant="subtitle">입력 내 실행</Text><Text as="p" variant="bodySmall">입력 오른쪽의 버튼이나 Enter로 같은 검색을 실행합니다.</Text><code>Input · endAction</code></div>
            <form onSubmit={event => { event.preventDefault(); setMessage('입력 검색 예시를 실행했습니다. 실제 데이터는 조회하지 않습니다.'); }}><Input aria-label="예시 검색어" name="query" placeholder="검색어" enterKeyHint="search" endAction={<IconButton type="submit" aria-label="예시 검색 실행" icon={<Search />} />} /></form>
          </div>
          <div className="catalog-example-row"><div className="catalog-example-note"><Text as="h3" variant="subtitle">필터 선택</Text><Text as="p" variant="bodySmall">중립 표면과 작은 좌우 여백을 사용하고, 기기의 기본 선택 목록을 엽니다. 모바일 터치 높이와 입력 글자 크기는 유지합니다.</Text><code>Select · filter</code></div>
            <Field htmlFor="catalog-filter-sport" label="종목"><Select id="catalog-filter-sport" variant="filter" value={filterSport} onChange={event => setFilterSport(event.target.value)}><option value="all">전체</option><option value="bike">사이클</option><option value="run">러닝</option><option value="swim">수영</option></Select></Field>
          </div>
          <div className="catalog-example-row"><div className="catalog-example-note"><Text as="h3" variant="subtitle">기록 표시 체크박스</Text><Text as="p" variant="bodySmall">native checkbox와 44px 클릭 영역입니다. Space 키로도 선택을 바꿀 수 있습니다.</Text><code>Checkbox</code></div>
            <div><Checkbox aria-label="예시 기록 표시" checked={recordChecked} onChange={event => setRecordChecked(event.target.checked)} /><Text as="span" variant="bodySmall">예시 기록 · {recordChecked ? '표시' : '숨김'}</Text></div>
          </div>
        </section>

        <section id="sport-icons" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">종목 아이콘</Text><Text as="p" variant="body" tone="tertiary">기본 측면과 활동 피드의 뒤쪽 사선 시점을 실제 표시 크기로 비교합니다. 모두 현재 글자색을 따르며 종목을 구분하는 보조 표시입니다.</Text></div>
          {(['bike', 'run', 'swim'] as const).map(sport => <div key={sport} className="catalog-example-row">
            <div className="catalog-example-note"><Text as="h3" variant="subtitle">{sport === 'bike' ? '사이클' : sport === 'run' ? '러닝' : '수영'}</Text><code>SportIcon · perspective</code></div>
            <div className="catalog-sport-icon-samples">{(['side', 'rear'] as const).map(perspective => <div key={perspective} className="catalog-sport-icon-view">
              <Text as="p" variant="caption" tone="tertiary">{perspective === 'side' ? '기본 측면' : '뒤쪽 사선 · 피드'}</Text>
              <div className="catalog-sport-icon-sizes">{([18, 24, 32] as const).map(size => <figure key={size} className="catalog-sport-icon-sample">
                <SportIcon sport={sport} perspective={perspective} size={size} />
                <Text as="figcaption" variant="caption" tone="tertiary">{size}px</Text>
              </figure>)}</div>
            </div>)}</div>
          </div>)}
        </section>

        <section id="tables" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">표</Text><Text as="p" variant="body" tone="tertiary">같은 단위는 열로 정렬하고, 비교할 이름은 가로로 이동해도 유지합니다.</Text></div>
          <div className="catalog-table-heading"><ToggleControls variant="axis" aria-label="표 예시 상태"><ToggleButton selected={tableState === 'records'} onClick={() => setTableState('records')}>기록</ToggleButton><ToggleButton selected={tableState === 'empty'} onClick={() => setTableState('empty')}>비어 있음</ToggleButton><ToggleButton selected={tableState === 'loading'} onClick={() => setTableState('loading')}>불러오는 중</ToggleButton></ToggleControls></div>
          <DataTable caption="활동 요약 · 생성한 예시" columns={summaryColumns} rows={tableState === 'records' ? sortedRows : []} rowKey={row => row.id} loading={tableState === 'loading'} loadingLabel="예시 기록을 불러오는 중입니다." emptyLabel="표시할 예시 기록이 없습니다. 위에서 기록을 선택해 복원하세요." />
          <Text as="p" variant="bodySmall" tone="tertiary">거리·시간·평균 파워 제목을 눌러 정렬합니다. 현재: {tableSort.key === 'distance' ? '거리' : tableSort.key === 'duration' ? '시간' : '평균 파워'} {tableSort.direction === 'ascending' ? '오름차순' : '내림차순'}. <strong>0</strong>은 관측한 값, <strong>—</strong>는 수신한 값이 없음을 뜻합니다. 미수신 값은 정렬 방향과 관계없이 마지막에 둡니다.</Text>
          <Text as="p" variant="bodySmall" tone="tertiary">DataTable은 caption·표 머리글·고정 이름 열·가로 스크롤·로딩과 빈 상태를 관리합니다. 행 순서와 정렬 상태는 페이지가 소유합니다. 소스: <code>src/theme/components/DataTable.tsx</code>.</Text>
        </section>

        <section id="combo" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">복합 차트</Text><Text as="p" variant="body" tone="tertiary">하나의 활동에서 파워와 심박 반응을 같은 시각에 살펴봅니다.</Text></div>
          <div className="catalog-chart-heading"><Text variant="subtitle">강변 아침 라이딩 · 생성한 예시</Text><Button variant="ghost" size="sm" onClick={() => { setComboEmpty(!comboEmpty); setComboSelected(null); }}>{comboEmpty ? '복합 차트 복원' : '복합 차트 빈 상태'}</Button></div>
          <Text as="p" variant="bodySmall" tone="tertiary">파워는 막대·왼쪽 W축, 심박수는 선·오른쪽 bpm축입니다. 여기서 색은 한 활동의 지표를 식별합니다. 아래 기록 비교에서는 같은 색이 라이더를 식별합니다. 서로 다른 단위의 높이를 직접 비교하지 않습니다.</Text>
          <ComboChart series={comboSeries} axes={COMBO_AXES} domain={COMBO_DOMAIN} xLabel="실제 시각" formatX={clock} colors={theme.chartColors} visibleSeries={comboVisible} onToggleSeries={onToggleComboSeries} selectedCoordinate={comboSelected} onSelectCoordinate={setComboSelected} labels={COMBO_LABELS} />
          <DataTable caption={comboSelected == null ? '복합 차트 선택 지점' : `복합 차트 선택 지점 · ${clockExact(comboSelected)}`} columns={[
            { id: 'time', header: '실제 시각', rowHeader: true, cell: () => comboSample ? clockExact(comboSample.time) : '—' },
            { id: 'power', header: '파워 · 막대 (W)', align: 'end', cell: () => <ChartValue primary={!comboVisible.has('power') ? '숨김' : comboSample?.power == null ? '—' : comboSample.power.toFixed(0)} /> },
            { id: 'hr', header: '심박수 · 선 (bpm)', align: 'end', cell: () => <ChartValue primary={!comboVisible.has('hr') ? '숨김' : comboSample?.hr == null ? '—' : comboSample.hr.toFixed(0)} /> },
          ]} rows={[{ id: 'combo-selection' }]} rowKey={row => row.id} emptyLabel="선택한 표본이 없습니다." />
          <Text as="p" variant="bodySmall" tone="tertiary">집계하지 않은 생성 표본 {FIXTURE_COMBO_SAMPLES.length}개입니다. 09:39에는 미수신 공백, 10:03에는 실제 0 W를 넣어 구분을 확인할 수 있습니다. 범례는 지표를 켜고 끄며, 선택 수치는 화면을 벗어나도 유지합니다. 소스: <code>src/theme/components/ComboChart.tsx</code>.</Text>
        </section>

        <section id="analysis-controls" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">분석 컨트롤</Text><Text as="p" variant="body" tone="tertiary">표시 지표와 범위, 계산 상태, 훈련 변화의 순서로 읽습니다. 아래 존과 계산값은 표현 검증을 위해 준비한 생성 예시입니다.</Text></div>
          <Section title="활동 분석" headingLevel={3} description="고도는 고정 범례로, 선택할 지표는 체크 토글로 구분합니다.">
            <Section title="차트 경계의 임시 설명" headingLevel={3} description="좌표는 기능이 정하고 공통 툴팁이 시작·중앙·끝 정렬을 담당합니다. 계속 읽을 값은 고정 비교 표에 둡니다.">
            <div className="catalog-tooltip-examples">{(['start', 'center', 'end'] as const).map(placement => <div key={placement}><ChartTooltip label={placement} placement={placement} style={{ left: placement === 'start' ? '0%' : placement === 'end' ? '100%' : '50%', top: 0 }}>CTL 42 · ATL 38</ChartTooltip></div>)}</div>
          </Section>
          <div className="catalog-analysis-controls">
              <ToggleControls aria-label="분석 예시 표시 지표">{FIXTURE_METRICS.map(metric => <ToggleButton key={metric.id} showCheck selected={analysisMetrics.includes(metric.id)} onClick={() => setAnalysisMetrics(analysisMetrics.includes(metric.id) ? analysisMetrics.filter(value => value !== metric.id) : [...analysisMetrics, metric.id])}>{metric.label}</ToggleButton>)}</ToggleControls>
              <ChartLegend marker="dot" aria-label="분석 차트 고정 범례" items={[{ label: '고도 · 고정 범례', color: theme.chartColors.altitude }]} />
            </div>
            <div className="catalog-analysis-controls"><ToggleControls variant="axis" aria-label="분석 예시 비교 기준"><ToggleButton selected={analysisAxis === 'distance'} onClick={() => setAnalysisAxis('distance')}>거리</ToggleButton><ToggleButton selected={analysisAxis === 'time'} onClick={() => setAnalysisAxis('time')}>경과 시간</ToggleButton></ToggleControls><ChartRangeControls mode={analysisRangeMode} canPan={analysisRangeSelected} canReset={analysisRangeSelected || analysisRangeMode !== 'inspect'} labels={{ controls: '분석 예시 구간 조작', selectRange: '구간 선택', panRange: '구간 이동', reset: '초기화' }}
              onModeChange={next => { if (next === 'select') { setAnalysisRange([30, 60]); setAnalysisRangeMode('inspect'); } else setAnalysisRangeMode(next); }} onReset={() => { setAnalysisRange(null); setAnalysisRangeMode('inspect'); }}
              onPanKeyDown={event => {
                if (analysisRangeMode !== 'pan' || !analysisRange || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                if (event.key === 'Escape') { setAnalysisRangeMode('inspect'); return; }
                const span = analysisRange[1] - analysisRange[0];
                setAnalysisRange(event.key === 'Home' ? [0, span] : event.key === 'End' ? [90 - span, 90] : panChartRange(analysisRange, event.key === 'ArrowLeft' ? 25 : -25, 100, [0, 90]));
              }} /></div>
            <Text as="p" variant="bodySmall" tone="tertiary" role="status">예시 표시 구간: {analysisRangeCaption}. 생성 예시에서 선택은 준비한 30–60분 구간을 선택합니다. 이동을 켠 뒤 방향키·Home/End로 범위를 옮길 수 있습니다. 실제 기록 비교 차트는 포인터 드래그도 지원합니다. 아래 회색 평균은 현재 표시 범위의 예시 관측 평균입니다.</Text>
            <div className="catalog-analysis-timeline">
              <div className="catalog-table-heading"><Text as="h4" variant="bodyMedium"><InfoTip title="존 타임라인" label="존 타임라인 설명" content="준비된 파워·심박 존을 경과 시간에 비례해 표시한 생성 예시입니다. 존 계산과 기준값 판단은 페이지가 담당하고, 공통 컴포넌트는 구간의 비율과 라벨을 표시합니다.">존 타임라인</InfoTip></Text><Text variant="caption" tone="tertiary">구간 폭은 시간 비율 · 파워 존 내부만 은은한 명암</Text></div>
              <SegmentTimeline rows={analysisTimelineRows} aria-label={`생성한 파워·심박 존 타임라인 · ${analysisRangeCaption}`} accessibleHint="구간을 탭하거나 키보드로 선택하면 범위와 존 구성을 아래에서 확인할 수 있습니다. 스크린리더와 마우스 도움말도 지원합니다. 준비한 예시 값이며 실제 존 계산을 수행하지 않습니다." />
              <SegmentTimeline presentation="distribution" rows={analysisTimelineRows} aria-label="같은 준비된 존 구성의 읽기 전용 분포 · 정확한 값은 위의 고정 설명에서 확인" />
              <ChartLegend marker="dot" items={analysisZoneColors.slice(0, 5).map((color, index) => ({ label: `Z${index + 1}`, color }))} />
            </div>
            <DataTable caption={`원본 값 · ${analysisAxis === 'time' ? `${analysisSample.time.toFixed(1)}분` : `${analysisSample.distance.toFixed(1)} km`}`} columns={[{ id: 'point', header: '선택 지점', rowHeader: true, cell: () => analysisRangeSelected ? '표시 구간 중앙' : '전체 중 지점' }, ...FIXTURE_METRICS.filter(metric => analysisMetrics.includes(metric.id)).map(metric => ({ id: metric.id, header: `${metric.label} (${metric.unit})`, align: 'end' as const, cell: () => <ChartValue primary={analysisSample[metric.id] == null ? '—' : analysisSample[metric.id]!.toFixed(metric.id === 'speed' ? 1 : 0)} secondary={`평균 ${fixtureObservedMean(FIXTURE_RECORDS[0]!, metric.id, analysisAxis, analysisDisplayRange)?.toFixed(1) ?? '—'}`} /> }))]} rows={analysisMetrics.length ? [{ id: 'analysis-point' }] : []} rowKey={row => row.id} emptyLabel="위에서 표시할 지표를 선택하세요. 고도 범례는 고정입니다." />
          </Section>

          <div className="catalog-analysis-metadata">
            <div className="catalog-table-heading"><Text as="h3" variant="subtitle">계산 결과와 기준값</Text><ToggleControls variant="axis" aria-label="분석 계산값 예시 상태">{([{ id: 'ready', label: '완료', accessibleLabel: '계산 완료' }, { id: 'pending', label: '대기', accessibleLabel: '계산 대기' }, { id: 'stale', label: '변경', accessibleLabel: '기준 변경' }, { id: 'outside', label: '범위 밖', accessibleLabel: '표시 범위 밖' }] as const).map(state => <ToggleButton key={state.id} aria-label={state.accessibleLabel} selected={analysisState === state.id} onClick={() => setAnalysisState(state.id)}>{state.label}</ToggleButton>)}</ToggleControls></div>
            <Card variant="inset" padding="compact" title="서버 계산 메타데이터" actions={<Chip variant={analysisState === 'ready' ? 'default' : 'warning'}>{analysisState === 'ready' ? '계산 완료' : analysisState === 'pending' ? '계산 대기' : analysisState === 'stale' ? '재계산 필요' : '표시 범위 밖'}</Chip>}>
              <div className="catalog-card-content"><Text as="p" variant="bodySmall">{analysisState === 'pending' ? '아직 계산값이 없습니다. 미수신 값을 0으로 표시하지 않습니다.' : analysisState === 'stale' ? '이전 FTP 250 W로 계산한 예시 결과입니다. 기준값이 변경되어 새 계산을 기다리는 상태입니다.' : `분석 기준 FTP 250 W · NP ${analysisState === 'outside' ? '360' : '195'} W · 계산 시각 09:42 (예시)`}</Text><Text as="p" variant="caption" tone="tertiary">읽기 전용 상태 정보입니다. 위 선택은 카탈로그의 예시 상태만 변경하며 서버에 계산을 요청하지 않습니다.</Text></div>
            </Card>
          </div>

          <Section title={<InfoTip title="강도계수 · IF" label="강도계수 IF 설명" content="이 예시는 준비한 NP와 FTP의 비율을 표시합니다. 게이지는 0.40–1.30의 고정 범위와 FTP 기준 1.00을 사용합니다. 계산·기준값·미수신 판단은 페이지가 소유합니다.">강도계수 · IF</InfoTip>} headingLevel={3} description="읽기 전용 지표 · NP ÷ FTP · 표시 범위 0.40–1.30">
            <div className="catalog-analysis-if-value"><Text variant="dataMedium">{analysisIf == null ? '—' : analysisIf.toFixed(2)}</Text><Text variant="bodySmall" tone="tertiary">{analysisState === 'stale' ? '이전 기준의 계산값' : analysisState === 'pending' ? '계산 결과를 기다리는 중' : analysisState === 'outside' ? '실제 값은 1.44 · 마커는 범위 끝에 표시' : 'NP 195 W ÷ FTP 250 W'}</Text></div>
            {analysisIf == null ? <Text as="p" variant="bodySmall" tone="tertiary">계산된 IF가 없어 게이지를 표시하지 않습니다.</Text> : <ReferenceGauge value={analysisIf} domain={ANALYSIS_IF_DOMAIN} bands={analysisBandBoundaries.slice(0, -1).map((from, index) => ({ from, to: analysisBandBoundaries[index + 1]!, color: analysisZoneColors[index], active: analysisIf >= from && (analysisIf < analysisBandBoundaries[index + 1]! || index === 5) }))} ticks={ANALYSIS_IF_TICKS} reference={{ value: 1, label: 'FTP 1.00' }} outsideLabel={analysisIf > ANALYSIS_IF_DOMAIN[1] ? `${analysisIf.toFixed(2)} · 범위 밖` : undefined} aria-label={`생성한 IF 예시 ${analysisIf.toFixed(2)} · FTP 기준 1.00`} />}
          </Section>

          <Section title="통합 훈련 상태 변화" headingLevel={3} description="모든 행은 같은 축과 0 기준을 사용합니다. 마커와 수치로 활동 전후를 함께 비교합니다.">
            {analysisState === 'pending' ? <Text as="p" variant="bodySmall" tone="tertiary">활동 전·후 계산값을 기다리고 있습니다. 체력·피로·상태를 0으로 대체하지 않습니다.</Text> : <BeforeAfterPlot rows={analysisFitnessRows} domain={ANALYSIS_FITNESS_DOMAIN} reference={{ value: 0, label: '0' }} beforeLabel="활동 전" afterLabel="활동 후" />}
            <Text as="p" variant="bodySmall" tone="tertiary">CTL·ATL·TSB는 준비한 생성 예시입니다.{analysisState === 'stale' ? ' 현재 표시된 값은 이전 기준의 계산 결과입니다.' : ''} 음수 TSB 영역은 기준 아래임을 나타내며, 색으로 좋고 나쁨을 단정하지 않습니다.</Text>
          </Section>
          <Text as="p" variant="bodySmall" tone="tertiary">공통 표현: <code>SegmentTimeline</code> · <code>ReferenceGauge</code> · <code>BeforeAfterPlot</code>. 소스: <code>src/theme/components/</code>. 계산·기준·단위·서버 상태는 소비자가 소유하며, 동일 컴포넌트를 실제 활동 분석에서도 사용합니다.</Text>
        </section>

        <section id="composition" className="catalog-section">
          <div className="catalog-section-heading"><div><Text as="h2" variant="title">기록 비교 · 지도와 차트</Text><Text as="p" variant="body" tone="tertiary">범위를 좁히고, 위치를 짚고, 원본 수치까지 확인합니다.</Text></div><span className="catalog-fixture-badge">생성한 예시 · 2명</span></div>
          <div className="catalog-map-heading"><Text variant="subtitle">경로와 현재 구간</Text><Text variant="bodySmall" tone="tertiary">// 영역 크기 · +/− 지도 배율</Text></div>
          <div id="catalog-map-surface" className="catalog-map" data-expanded={expanded}>
            <svg className="catalog-map-svg" viewBox="0 0 600 264" role="img" aria-label={`예시 경로. ${viewport ? '차트에서 확대한 구간이 강조되어 있습니다.' : '전체 경로를 표시합니다.'}`}>
              <g transform={`translate(300 132) scale(${camera}) translate(-300 -132)`}>
                <path className="catalog-map-road" d="M0 60 600 160M0 220 600 90M180 0 220 264M440 0 390 264" />
                {FIXTURE_RECORDS.map((record, index) => <g key={record.id} transform={`translate(0 ${index * 5})`}>
                  <path d={fixtureRoutePath()} fill="none" stroke={recordColors[index]} strokeWidth="3" strokeDasharray={index === 1 ? "5 3" : undefined} opacity={viewport ? 0.2 : CHART_PRESENTATION.lineOpacity} />
                  {viewport && <path d={fixtureRoutePath(routeProgress(record, visibleRange[0]), routeProgress(record, visibleRange[1]))} fill="none" stroke={recordColors[index]} strokeWidth="4" opacity={CHART_PRESENTATION.lineOpacity} strokeDasharray={index === 1 ? "5 3" : undefined} />}
                </g>)}
                <circle cx="62" cy="132" r="5" fill={recordColors[0]} />
                {selected != null && !empty && FIXTURE_RECORDS.map((record, index) => {
                  const sample = fixtureNearest(record, selected, axis);
                  if (!sample) return null;
                  const [x, y] = fixtureRoute(routeProgress(record, selected));
                  return <circle key={record.id} cx={x} cy={y + index * 5} r="5" fill="var(--bg-1)" stroke={recordColors[index]} strokeWidth="2" />;
                })}
              </g>
            </svg>
            <div className="catalog-map-caption">예시 경로 · {viewport ? '차트에서 보는 구간 강조' : '전체 경로'}</div>
            <MapResizeControls expanded={expanded} controlsId="catalog-map-surface" expandLabel="지도 영역 확대" collapseLabel="지도 영역 축소" onToggle={() => setExpanded(!expanded)} />
            <MapNavigation aria-label="예시 지도 카메라"><MapControlButton iconOnly aria-label="지도 배율 확대" disabled={camera >= 2.5} onClick={() => setCamera(Math.min(2.5, camera + 0.5))}><Plus /></MapControlButton><MapControlButton iconOnly aria-label="지도 배율 축소" disabled={camera <= 1} onClick={() => setCamera(Math.max(1, camera - 0.5))}><Minus /></MapControlButton><MapControlButton iconOnly aria-label="경로 전체 보기" disabled={camera === 1} onClick={() => setCamera(1)}><Crosshair /></MapControlButton></MapNavigation>
          </div>
          <ChartLegend items={FIXTURE_RECORDS.map((record, index) => ({ label: record.label, color: recordColors[index]!, seriesId: record.id, dasharray: index === 1 ? "5 3" : undefined }))} />
          <div className="catalog-chart-heading"><Text as="h3" variant="subtitle">라이딩 성능 비교</Text><Button variant="ghost" size="sm" onClick={() => { setEmpty(!empty); setSelected(null); }}>{empty ? '예시 기록 복원' : '빈 상태 보기'}</Button></div>
          <div className="catalog-comparison-controls">
            <ToggleControls aria-label="예시 차트 지표">{FIXTURE_METRICS.map(metric => <ToggleButton key={metric.id} showCheck selected={metrics.includes(metric.id)} onClick={() => setMetrics(metrics.includes(metric.id) ? metrics.filter(value => value !== metric.id) : [...metrics, metric.id])}>{metric.label}</ToggleButton>)}</ToggleControls>
            <ToggleControls variant="axis" aria-label="예시 비교 기준"><ToggleButton selected={axis === 'distance'} onClick={() => changeAxis('distance')}>거리</ToggleButton><ToggleButton selected={axis === 'time'} onClick={() => changeAxis('time')}>실제 시각</ToggleButton></ToggleControls>
          </div>
          <Text as="p" variant="bodySmall" tone="tertiary">{axis === 'distance' ? '각 기록 출발점부터의 누적거리 기준입니다. 같은 경로 위치·시각을 보장하지 않습니다.' : '실제 기록 시각으로 비교합니다. 출발 시각 차이를 그대로 유지합니다.'} 기준을 바꾸면 확대와 지점 선택을 초기화합니다.</Text>
          <Text as="p" variant="bodySmall" tone="tertiary">선을 짚으면 하단 수치와 지도 위치가 함께 바뀝니다. 선택 지점은 마우스를 옮겨도 유지됩니다.</Text>
          <div className="catalog-chart-interaction" tabIndex={0} role="group" aria-label="예시 차트 키보드 탐색" onKeyDown={event => { if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); moveSelection(event.key); } }}>
            <ComparisonChart lanes={lanes} domain={domain} minSpan={axis === 'distance' ? 0.5 : 2} axisKey={axis} colors={theme.chartColors} formatTick={axis === 'time' ? clock : value => value.toFixed(0)} rangeLabel={rangeLabel} selectedCoordinate={selected} onHoverCoordinate={setSelected} onViewportChange={onViewportChange} labels={{ ...chartLabels, empty: empty ? '수신된 표본이 없습니다. 예시 기록을 복원하세요.' : chartLabels.empty }} description={<Text variant="bodySmall" tone="tertiary">파워와 속도는 표시용 평균 흐름입니다. 데이터 공백은 연결하지 않으며, 아래 수치는 원본 표본을 사용합니다.</Text>} />
          </div>
          <div className="catalog-table-heading"><Text as="h3" variant="subtitle">선택 지점 {selected == null ? '' : `· ${formatCoordinate(selected)}`}</Text><Text variant="bodySmall" tone="tertiary">아래 작은 수치: {viewport ? '현재 구간' : '전체 구간'} 관측 평균</Text></div>
          <div className="catalog-table-scroll" tabIndex={0} role="region" aria-label="예시 선택 지점과 평균 비교표">
            <table className="catalog-comparison-table"><thead><tr><th scope="col">라이더</th>{FIXTURE_METRICS.filter(metric => metrics.includes(metric.id)).map(metric => <th key={metric.id} scope="col">{metric.label}<span>{metric.unit}</span></th>)}</tr></thead><tbody>{FIXTURE_RECORDS.map(record => {
              const sample = fixtureNearest(record, selected, axis);
              return <tr key={record.id}><th scope="row">{record.label}</th>{FIXTURE_METRICS.filter(metric => metrics.includes(metric.id)).map(metric => {
                const raw = empty ? null : sample?.[metric.id], average = empty ? null : fixtureObservedMean(record, metric.id, axis, visibleRange);
                return <td key={metric.id}><ChartValue primary={raw == null ? '—' : raw.toFixed(metric.id === 'speed' ? 1 : 0)} secondary={`평균 ${average == null ? '—' : average.toFixed(1)}`} /></td>;
              })}</tr>;
            })}</tbody></table>
          </div>
          <Text as="p" variant="bodySmall" tone="tertiary">평균은 실제 관측 시간을 가중합니다. 미수신 구간을 제외하고 0 W·0 km/h는 유지합니다. 예시 기록은 09:00·09:02에 시작하며, 중간에 3분간 센서 공백이 있습니다.</Text>
        </section>

        <section id="states" className="catalog-section">
          <div className="catalog-section-heading"><Text as="h2" variant="title">상태와 접근성</Text><Text as="p" variant="body" tone="tertiary">선택 상태, 진행 상황, 복구 방법을 같은 위치에서 보여줍니다.</Text></div>
          <div className="catalog-state-grid">
            <div className="catalog-state-example"><Text as="h3" variant="subtitle">기본 · 비활성 · 진행 중</Text><div className="catalog-inline-controls"><IconButton icon={<Plus />} aria-label="예시 항목 추가" onClick={() => setMessage('예시 항목을 추가했습니다.')} /><Button disabled>권한 없음</Button><Button loading={loading} onClick={() => { setSaveStatus('저장 중… · 예시'); setLoading(true); }}>{loading ? '저장 중…' : '예시 저장'}</Button><Button loading>불러오는 중…</Button></div><Text as="p" variant="bodySmall" tone="tertiary">진행 중에는 중복 실행을 막습니다. 위의 예시 저장은 1초 후 완료됩니다.</Text><p className="catalog-local-status" role="status">{saveStatus}</p></div>
            <div className="catalog-state-example"><Text as="h3" variant="subtitle">켜짐 · 꺼짐 · 선택 불가</Text><ToggleControls aria-label="토글 상태 예시"><ToggleButton selected={stateSelected} showCheck onClick={() => setStateSelected(!stateSelected)}>실시간 위치</ToggleButton><ToggleButton selected={notifications} showCheck onClick={() => setNotifications(!notifications)}>구간 알림</ToggleButton><ToggleButton selected={false} showCheck disabled>공유 불가</ToggleButton></ToggleControls><Text as="p" variant="bodySmall" tone="tertiary">색 외에 체크와 눌림 상태로 선택을 구분합니다.</Text></div>
            <div className="catalog-state-example"><Text as="h3" variant="subtitle">긴 문구</Text><Button block leadingIcon={<Check />} onClick={() => setMessage('긴 문구 버튼을 실행했습니다.')}>선택한 활동의 변경 사항을 저장하고 돌아가기</Button><Text as="p" variant="bodySmall" tone="tertiary">좁은 폭과 큰 글자에서도 의미를 생략하지 않습니다.</Text></div>
            <div className="catalog-state-example"><Text as="h3" variant="subtitle">키보드 포커스</Text><Text as="p" variant="bodySmall">Tab으로 이동하고 Enter·Space로 실행합니다. 차트 탐색 영역에서는 ←·→, Home·End로 선택 지점을 이동합니다. 포커스 테두리는 색 테마와 무관하게 유지됩니다.</Text></div>
          </div>
        </section>
        <footer className="catalog-footer"><Text variant="bodySmall" tone="tertiary">Apple Human Interface Guidelines를 바탕으로 한 ORider 웹 컨트롤. 예시 상태는 이 페이지에서만 유지됩니다.</Text><a href="#adoption">맨 위로</a></footer>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<ControlsCatalog />);
