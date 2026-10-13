import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import fitness from "../i18n/resources/ko/fitness.json";
import common from "../i18n/resources/ko/common.json";
import { ThemeProvider } from "../contexts/ThemeContext";
import { OriderThemeProvider, Card, Text } from "../theme";
import { NativePowerTwelvePersonalView } from "../features/fitness/components/NativePowerTwelvePersonalView";
import { nativeTwelveFixture } from "./nativeTwelveFixture";
import type { NativePowerTwelveResponse, NativePowerTwelvePeriod } from "@shared/types/stage-native-power-v2-twelve";
import "../index.css";
import "../theme/generated.css";
import "../theme/components/components.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw Error("local_preview_only");
void i18next.use(initReactI18next).init({ lng: "ko", resources: { ko: { fitness, common } }, interpolation: { escapeValue: false } });
function Preview() {
 const cutoff = Date.UTC(2026, 9, 13);
 const [response, setResponse] = useState<NativePowerTwelveResponse|null>(null);
 const [selectedIds, onSelect] = useState<string[]>(["orider_fixture_a"]);
 const [inspectedIds, setInspected] = useState<string[]>([]);
 const [periods, onPeriods] = useState<NativePowerTwelvePeriod[]>([{id:"recent",fromInclusiveMs:cutoff-56*86400000,toExclusiveMs:cutoff},{id:"all",fromInclusiveMs:0,toExclusiveMs:cutoff}]);
 return <main className="mx-auto max-w-5xl p-4 space-y-5"><Text as="h1" variant="pageTitle">활동 분석</Text><Text as="p" variant="bodyMedium" tone="secondary">로컬 디자인 검수 · 합성 예시입니다. 실제 계정 데이터와 서버 호출을 사용하지 않습니다.</Text><Card><NativePowerTwelvePersonalView activities={[{activityId:"orider_fixture_a",title:"일요일 아침 라이딩 · 10월 11일",headBinding:"synthetic-a"},{activityId:"orider_fixture_b",title:"평일 훈련 · 10월 8일",headBinding:"synthetic-b"}]} selectedIds={selectedIds} inspectedIds={inspectedIds} periods={periods} response={response} busy={false} failure={false} enabled onSelect={ids=>{onSelect(ids);setInspected([]);setResponse(null);}} onInspect={id=>setInspected(v=>[...new Set([...v,id])])} onLoad={()=>setResponse(nativeTwelveFixture(periods))} onPeriods={ranges=>{onPeriods(ranges);setInspected([]);setResponse(null);}}/></Card></main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><ThemeProvider><OriderThemeProvider><Preview/></OriderThemeProvider></ThemeProvider></BrowserRouter></React.StrictMode>);
