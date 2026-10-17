// Isolated visual harness: synthetic data only, no Firebase initialization or production network.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { parseRecipeSharePayload } from "./recipeSharePayload";
import { RecipeShareCard, type RecipePublicCard } from "../../src/components/creator/RecipeShareCard";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";

const params = new URLSearchParams(location.search);
const language = params.get("lang") === "en" ? "en" : "ko";
void i18n.use(initReactI18next).init({ lng: language, resources: {}, interpolation: { escapeValue: false } });
const ko = language === "ko";
const edge = params.get("edge") === "true";
const card: RecipePublicCard = parseRecipeSharePayload(params.get("payload") ?? new URLSearchParams(location.hash.slice(1)).get("payload")) ?? {
  kicker: ko ? "이번 주 / MY WEEK" : "MY WEEK / IN MOTION",
  metrics: [
    { label: ko ? "이동거리" : "DISTANCE COVERED", value: "186 km" },
    { label: ko ? "라이딩 횟수" : "RIDE COUNT", value: edge ? (ko ? "미기록 포함" : "INCOMPLETE") : (ko ? "4회" : "4 rides") },
    { label: ko ? "누적 상승고도" : "ELEVATION GAIN", value: "1,840 m" },
  ],
  title: edge ? (ko ? "매일의 작은 페달링이 모여 오래 기억할 소중한 기록" : "Every ride counts. Keep going.") : (ko ? "꾸준함이 만든 한 주" : "Small rides. Real progress."),
  body: edge ? (ko ? "꾸준한 페달링으로 나만의 리듬을 찾아갑니다. 함께 달리는 즐거움과 도전의 기억을 오래 간직하며 다음 라이딩에도 이 마음을 이어갑니다. ".repeat(3).slice(0, 160) : "Finding my rhythm one ride at a time, making room for recovery and keeping the joy of riding alive. Here's to another week of small, meaningful steps forward.") : (ko ? "짧은 라이딩과 긴 라이딩이 어우러진 한 주입니다.\n서로 다른 코스에서 나만의 리듬을 찾았습니다." : "Short spins and longer rides shaped this week.\nDifferent routes helped me find my rhythm."),
  footer: ko ? "위치·활동명·민감 지표 제외" : "Location and sensitive metrics excluded",
};
function PostDraftProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><pre data-testid="post-state">{JSON.stringify({ pathname: location.pathname, state: location.state })}</pre><button onClick={() => navigate(-1)}>Back to card</button></>;
}
function Fixture() {
  const navigate = useNavigate();
  const [result, setResult] = useState({ card, language, ready: params.get("ready") !== "false", account: "synthetic-owner" });
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const nextCard = parseRecipeSharePayload(detail.payload);
      if (!nextCard) throw new Error("Missing fixture result");
      void i18n.changeLanguage(detail.language);
      navigate(`/${detail.language}`, { replace: true });
      setResult({ card: nextCard, language: detail.language, ready: detail.ready, account: detail.account });
    };
    window.addEventListener("recipe-fixture-result", update);
    return () => window.removeEventListener("recipe-fixture-result", update);
  }, [navigate]);
  return <main className="mx-auto max-w-2xl p-6" style={{ background: "var(--bg-0)", color: "var(--ink-0)" }}>
    <h1 className="mb-4 text-[length:var(--fs-xl)] font-semibold">{result.language === "ko" ? "합성 데이터 검증 · 라이딩의 기억, 한 장으로" : "Synthetic fixture · a week worth remembering"}</h1>
    <RecipeShareCard key={result.account} language={result.language} ready={result.ready} card={result.card} onError={(action) => { document.body.dataset.exportError = action; }} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[`/${language}`]}><Routes><Route path="/:lang" element={<Fixture />} /><Route path="/:lang/community/board/write" element={<PostDraftProbe />} /></Routes></MemoryRouter></I18nextProvider>);
