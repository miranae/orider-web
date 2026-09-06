// 운영 인증·Firebase 없이 실제 PMC 컴포넌트를 렌더하는 합성 테스트 전용 진입점.
import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import PmcHistoryPanel from "../../src/features/fitness/components/PmcHistoryPanel";
import { calculateFitness } from "../../shared/training/fitness";
import ko from "../../src/i18n/resources/ko/fitness.json";
import en from "../../src/i18n/resources/en/fitness.json";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono/400.css";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";

const today = "2026-09-06";
const points = calculateFitness(Array.from({ length: 1500 }, (_, index) => ({
  date: new Date(Date.parse(`${today}T00:00:00Z`) - (1499 - index) * 86400000).toISOString().slice(0, 10),
  totalLoad: index % 7 === 0 ? 0 : Math.round(35 + index / 50 + 20 * Math.sin(index / 50)),
})));
const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ko";
await i18next.init({ lng: locale, fallbackLng: "en", defaultNS: "fitness", resources: { ko: { fitness: ko }, en: { fitness: en } }, interpolation: { escapeValue: false } });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><I18nextProvider i18n={i18next}>
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "var(--space-4)" }}>
      <p>브라우저 검증 전용 · 합성 데이터 · 실제 계정 연결 없음</p>
      <PmcHistoryPanel points={points} today={today} canonical />
    </main>
  </I18nextProvider></React.StrictMode>,
);
