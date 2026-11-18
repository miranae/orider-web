// Local-only synthetic regression surface. No auth provider or activity API reads.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";
import { ActivityMediaPanel } from "../../src/features/activity/detail/ActivityMediaPanel";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { Button, Card, Text } from "../../src/theme/components";
import { OriderThemeProvider } from "../../src/theme";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { buildSampledData } from "../../src/features/activity/detail/activityDetailDerived";
import { useActivityRangeSelection } from "../../src/hooks/useActivityRangeSelection";
import type { ActivityAnalysisModel } from "../../src/hooks/useActivityAnalysisModel";
import ElevationChart from "../../src/components/ElevationChart";
import { routeFixtureActivity as subject, routeFixtureStreams, routeFixtureParts } from "./routeSensorExpansionData";
import common from "../../src/i18n/resources/ko/common.json";
import activity from "../../src/i18n/resources/ko/activity.json";
import "../../src/index.css";
import "../../src/pages/activity/activity-detail-page.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";

await i18next.init({ lng: "ko", resources: { ko: { common, activity } }, interpolation: { escapeValue: false } });
function Fixture() {
  const { t } = useTranslation("activity");
  const [opened, setOpened] = useState(false);
  const [kind, setKind] = useState("sparse");
  const streams = useMemo(() => routeFixtureStreams(kind), [kind]);
  const sampled = useMemo(() => buildSampledData(streams), [streams]);
  const model = { activity: subject, streams, effectiveStreams: streams, serverMetrics: { metrics: null }, authorizedActivityAccess: true } as unknown as ActivityAnalysisModel;
  const selection = useActivityRangeSelection(model, sampled);
  const selectedSamples = selection.chartRange ? sampled.slice(selection.chartRange[0], selection.chartRange[1] + 1) : sampled;
  return <main className="site-shell space-y-4">
    <h1>활동 분석 지도·센서 회귀 검증</h1>
    <Text as="p">합성 활동 · 센서 5개 · 실제 계정·활동 데이터 사용 없음</Text>
    <Card><Text as="p">분석 요약: 40 m · 4초</Text></Card>
    <div className="flex flex-wrap gap-2">{[["sparse","결측 좌표"],["normal","정상 좌표"],["missing","좌표 없음"],["parts","분리 경로"]].map(([key,label]) => <Button key={key} variant="outline" onClick={() => { setKind(key!); selection.clear(); }}>{label}</Button>)}</div>
    <Button aria-expanded={opened} onClick={() => setOpened(value => !value)}>{t("analysisReading.exploration")}</Button>
    {opened && <ErrorBoundary><ActivityMediaPanel activity={subject} allowOwnerPreview={false} streams={streams}
      sport="ride" hasTrack summary={subject.summary} markerPosition={null} hoveredSegment={null} photos={[]} uploadedPhotos={[]}
      selectedRunRange={selection.routeRange} publicRouteParts={kind === "parts" ? routeFixtureParts : undefined}
      flyToPosition={null} t={t} />
      <Card><Text as="p">파워 센서 차트 · 드래그로 구간 선택</Text>
        <ElevationChart data={sampled.map(point => ({ distance: point.distance, elevation: point.altitude }))}
          overlays={[{ label: "Power", data: sampled.map(point => point.power), color: "#008986", yAxisID: "power", unit: "W" }]}
          rangeMode range={selection.chartRange ?? [0, sampled.length - 1]} onRangeChange={selection.selectChart}
          elapsedAxisSec={selection.sampledAxis ?? undefined} xAxis="elapsed" />
        <output>선택 표본: {selectedSamples.map(point => point.power).join(" · ")} W · 원본 인덱스 {selection.routeRange ? `${selection.routeRange.startIndex}~${selection.routeRange.endIndex}` : "없음"}</output>
      </Card>
    </ErrorBoundary>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><ThemeProvider><OriderThemeProvider><Fixture /></OriderThemeProvider></ThemeProvider></I18nextProvider>);
