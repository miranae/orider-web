import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import i18next from "i18next";
import {initReactI18next} from "react-i18next";
import activity from "../i18n/resources/ko/activity.json";
import common from "../i18n/resources/ko/common.json";
import {ThemeProvider} from "../contexts/ThemeContext";
import {OriderThemeProvider,Card,Text} from "../theme";
import {NativePowerV2DurationView} from "../features/activity/detail/NativePowerV2DurationView";
import {nativePowerV2DurationFixture} from "./nativePowerV2DurationFixture";
import type {NativePowerV2ReaderResponse} from "@shared/types/stage-native-power-v2-publication";
import "../index.css";
import "../theme/generated.css";
import "../theme/components/components.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono";
if(!import.meta.env.DEV||!["localhost","127.0.0.1"].includes(location.hostname))throw Error("local_preview_only");
void i18next.use(initReactI18next).init({lng:"ko",resources:{ko:{activity,common}},interpolation:{escapeValue:false}});
function Preview(){
 const [draft,setDraft]=useState("300"),[metadata,setMetadata]=useState<NativePowerV2ReaderResponse|null>(null),[result,setResult]=useState<NativePowerV2ReaderResponse|null>(null);
 const clear=()=>{setMetadata(null);setResult(null);};
 return <main className="mx-auto max-w-5xl p-4 space-y-5"><Text as="h1" variant="pageTitle">활동 분석</Text><Text as="p" variant="bodyMedium" tone="secondary">로컬 디자인 검수 · 합성 스칼라 예시입니다. 실제 계정, SDK 로그인, 서버 요청을 사용하지 않습니다.</Text><Card><NativePowerV2DurationView activityId="orider_fixture_a" draft={draft} metadata={metadata} result={result} busy={false} failure={false} canCalculate={metadata!==null} onDraft={value=>{setDraft(value);clear();}} onConfirm={()=>{setMetadata(nativePowerV2DurationFixture(Number(draft)));setResult(null);}} onCalculate={()=>setResult(nativePowerV2DurationFixture(Number(draft),true))} onCancel={clear}/></Card></main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><ThemeProvider><OriderThemeProvider><Preview/></OriderThemeProvider></ThemeProvider></BrowserRouter></React.StrictMode>);
