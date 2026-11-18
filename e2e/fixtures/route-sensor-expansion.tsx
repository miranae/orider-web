// Local-only synthetic regression surface. No auth provider or activity API reads.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { loadRuntimeConfig } from "../../src/services/runtimeConfig";
import { logClientError } from "../../src/services/errorLogger";
import { I18nextProvider, useTranslation } from "react-i18next";
import { ActivityMediaPanel } from "../../src/features/activity/detail/ActivityMediaPanel";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { Button, Card, Text } from "../../src/theme/components";
import { OriderThemeProvider } from "../../src/theme";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { buildSampledData, buildSummaryStats, buildChartOverlays } from "../../src/features/activity/detail/activityDetailDerived";
import { useActivityRangeSelection } from "../../src/hooks/useActivityRangeSelection";
import type { ActivityAnalysisModel } from "../../src/hooks/useActivityAnalysisModel";
import { visualRouteSelection } from "../../src/features/activity/detail/activityRangeSelection";
import ActivityPerformanceCharts from "../../src/features/activity/detail/ActivityPerformanceCharts";
import { getPerformanceOverlays } from "../../src/features/activity/detail/activityPerformancePresentation";
import { LocaleProvider } from "../../src/contexts/LocaleContext";
import { routeFixtureActivity as subject, routeFixtureStreams } from "./routeSensorExpansionData";
import common from "../../src/i18n/resources/ko/common.json";
import activity from "../../src/i18n/resources/ko/activity.json";
import "../../src/index.css";
import "../../src/pages/activity/activity-detail-page.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";

await loadRuntimeConfig();
const fixtureI18n = createInstance();
await new Promise<void>((resolve, reject) => {
  void fixtureI18n.init({ lng: "ko", fallbackLng: "ko", ns: ["common", "activity"], defaultNS: "common",
    resources: { ko: { common, activity } }, interpolation: { escapeValue: false } }, error => {
    if (error) {
      const failure = new Error("fixture/i18n-resources-unavailable");
      logClientError("RouteSensorExpansionFixture.i18n", failure);
      reject(failure);
    } else resolve();
  });
});
function Fixture() {
  const { t } = useTranslation("activity");
  const [opened, setOpened] = useState(false);
  const [visualRange, setVisualRange] = useState<[number,number] | null>(null);
  const [kind, setKind] = useState("sparse");
  const streams = useMemo(() => routeFixtureStreams(kind), [kind]);
  const sampled = useMemo(() => buildSampledData(streams), [streams]);
  const model = { activity: subject, streams, effectiveStreams: streams, serverMetrics: { metrics: null }, authorizedActivityAccess: true } as unknown as ActivityAnalysisModel;
  const selection = useActivityRangeSelection(model, sampled);
  const available = getPerformanceOverlays(sampled, "ride", "metric", null, "rpm");
  const active = new Set(available.map(config => config.key));
  const routeRange = visualRouteSelection(visualRange, sampled, streams.latlng, selection.routeRange);
  const selectedSamples = selection.chartRange ? sampled.slice(selection.chartRange[0], selection.chartRange[1] + 1) : sampled;
  return <main className="site-shell space-y-4">
    <h1>활동 분석 지도·센서 회귀 검증</h1>
    <Text as="p">합성 활동 · 센서 5개 · 실제 계정·활동 데이터 사용 없음</Text>
    <Card><Text as="p">분석 요약: 40 m · 4초</Text></Card>
    <div className="flex flex-wrap gap-2">{[["sparse","결측 좌표"],["normal","정상 좌표"],["missing","좌표 없음"]].map(([key,label]) => <Button key={key} variant="outline" onClick={() => { setKind(key!); selection.clear(); setVisualRange(null); }}>{label}</Button>)}</div>
    <Button aria-expanded={opened} onClick={() => setOpened(value => !value)}>{t("analysisReading.exploration")}</Button>
    {opened && <ErrorBoundary><ActivityMediaPanel activity={subject} allowOwnerPreview={false} streams={streams}
      sport="ride" hasTrack summary={subject.summary} markerPosition={null} hoveredSegment={null} photos={[]} uploadedPhotos={[]}
      selectedRunRange={routeRange ?? undefined}
      flyToPosition={null} t={t} />
      <Card><Text as="p">파워 센서 차트 · 드래그로 구간 선택</Text>
        <ActivityPerformanceCharts analysisStyle chartIdentity={kind} rawStreams={streams} sourceIndices={sampled.map(point => point.sourceIndex!)}
          rawElapsedAxis={selection.axis} elapsedAxisSec={selection.sampledAxis ?? undefined} xAxis="elapsed"
          elevData={sampled.map(point => ({ distance: point.distance, elevation: point.altitude }))}
          availableOverlays={available} activeOverlays={active} focusedOverlayKey={null} toggleOverlay={() => {}}
          chartOverlays={buildChartOverlays(available, active, sampled, label => label)}
          summaryStats={buildSummaryStats(streams, null)} hoverPoint={null} sport="ride" recordedRunCadenceUnit={null} metrics={null} hasElevation
          visualRange={visualRange} onVisualRangeChange={range => { setVisualRange(range); if (range) selection.selectChart(range); else selection.clear(); }} />
        <output>선택 표본: {selectedSamples.map(point => point.power ?? "—").join(" · ")} W · 원본 인덱스 {selection.routeRange ? `${selection.routeRange.startIndex}~${selection.routeRange.endIndex}` : "없음"}</output>
      </Card>
    </ErrorBoundary>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={fixtureI18n}><ThemeProvider><OriderThemeProvider><LocaleProvider userId={null}><Fixture /></LocaleProvider></OriderThemeProvider></ThemeProvider></I18nextProvider>);
