// Local-only synthetic regression surface. No auth provider or activity API reads.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";
import { ActivityMediaPanel } from "../../src/features/activity/detail/ActivityMediaPanel";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { Button, Card, Text } from "../../src/theme/components";
import { OriderThemeProvider } from "../../src/theme";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import type { Activity } from "../../shared/types";
import common from "../../src/i18n/resources/ko/common.json";
import activity from "../../src/i18n/resources/ko/activity.json";
import "../../src/index.css";
import "../../src/pages/activity/activity-detail-page.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";

await i18next.init({ lng: "ko", resources: { ko: { common, activity } }, interpolation: { escapeValue: false } });
const normal = [[37,127], [37.002,127.002], [37.004,127.004], [37.006,127.006]];
const sparse = [normal[0], normal[1], null, [37.02,127.02], [37.022,127.022]];
const parts = [normal.slice(0,2), [[37.02,127.02],[37.022,127.022]]];
const subject = { id: "synthetic-route-regression", type: "Ride", source: "strava", summary: { distance: 4000, ridingTimeMillis: 300000 } } as Activity;
function Fixture() {
  const { t } = useTranslation("activity");
  const [opened, setOpened] = useState(false);
  const [kind, setKind] = useState("sparse");
  const [selected, setSelected] = useState(false);
  const points = kind === "normal" ? normal : kind === "missing" ? [null, {}, null] : sparse;
  return <main className="site-shell space-y-4">
    <h1>활동 분석 지도·센서 회귀 검증</h1>
    <Text as="p">합성 활동 · 센서 5개 · 실제 계정·활동 데이터 사용 없음</Text>
    <Card><Text as="p">분석 요약: 4 km · 5분</Text></Card>
    <div className="flex flex-wrap gap-2">{[["sparse","결측 좌표"],["normal","정상 좌표"],["missing","좌표 없음"],["parts","분리 경로"]].map(([key,label]) => <Button key={key} variant="outline" onClick={() => { setKind(key!); setSelected(false); }}>{label}</Button>)}</div>
    <Button aria-expanded={opened} onClick={() => setOpened(value => !value)}>{t("analysisReading.exploration")}</Button>
    {opened && <ErrorBoundary><ActivityMediaPanel activity={subject} allowOwnerPreview={false} streams={{ userId: "synthetic", time: [0,1,2,3,4], latlng: points as [number,number][] }}
      sport="ride" hasTrack summary={subject.summary} markerPosition={null} hoveredSegment={null} photos={[]} uploadedPhotos={[]}
      selectedRunRange={selected ? {startIndex:3,endIndex:4} : undefined} publicRouteParts={kind === "parts" ? parts as [number,number][][] : undefined}
      flyToPosition={null} t={t} />
      <Card><Text as="p">센서 기록: 100 · 110 · 120 · 130 · 140 W</Text><Button onClick={() => setSelected(value => !value)}>원본 인덱스 3~4 선택</Button></Card>
    </ErrorBoundary>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><ThemeProvider><OriderThemeProvider><Fixture /></OriderThemeProvider></ThemeProvider></I18nextProvider>);
