// Synthetic, isolated display data. AuthProvider and real model readers are not mounted.
import IntegratedLoadCard from "../../src/components/mobile/IntegratedLoadCard";
import { SufficiencyInline } from "../../src/features/sufficiency/SufficiencyBlock";
import { sufficiencyBlock, sufficiencySet } from "../../src/features/sufficiency/__fixtures__";
import InfoTip from "../../src/components/InfoTip";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter,Route,Routes,useLocation,useNavigate,useParams,useSearchParams } from "react-router-dom";
import i18next,{ type ResourceLanguage } from "i18next";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { LocaleProvider } from "../../src/contexts/LocaleContext";
import { OriderThemeProvider } from "../../src/theme";
import MobileLogPage from "../../src/components/mobile/MobileLogPage";
import MobileTabBar from "../../src/components/mobile/MobileTabBar";
import Run30StageList from "../../src/features/training/run30/Run30StageList";
import type { Run30Session } from "../../src/features/training/run30/run30Api";
import "../../src/features/training/run30/run30.css";
import PlanPresentation from "../../src/features/training/plan/PlanPresentation";
import PlanRecordNavigation from "../../src/features/training/plan/PlanRecordNavigation";
import { useMobile } from "../../src/hooks/useMobile";
import FtpDecisionSection from "../../src/features/fitness/components/FtpDecisionSection";
import AnchoredDetailsSection from "../../src/components/redesign/AnchoredDetailsSection";
import CoachDetailRouteNotice from "../../src/features/fitness/components/CoachDetailRouteNotice";
import CoachDetailSection from "../../src/features/fitness/components/CoachDetailSection";
import FtpProgressionCard from "../../src/features/fitness/components/FtpProgressionCard";
import { Button,DropdownSelect,Text } from "../../src/theme/components";
import DateField from "../../src/components/redesign/DateField";
import { ErrorState } from "../../src/components/redesign";
import type { PlanModel } from "../../src/hooks/usePlanModel";
import type { Activity } from "../../shared/types";
import type { PlanDay } from "../../shared/types/goal";
import { planDayKey } from "../../shared/training/planDate";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono/400.css";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";
const fixture=new URLSearchParams(window.location.search);
const lang=window.location.pathname.startsWith("/en/")||fixture.get("lang")==="en"? "en":"ko";
const count=Math.min(1000,Math.max(0,Number(fixture.get("count")??1000)));
const resources=import.meta.glob("../../src/i18n/resources/*/*.json",{ eager: true,import: "default" });
const namespaces=Object.fromEntries(Object.entries(resources).filter(([path]) => path.includes(`/${lang}/`)).map(([path,value]) => [path.split("/").slice(-1)[0]!.replace(".json",""),value as ResourceLanguage[string]]));
await i18next.init({ lng: lang,fallbackLng: lang,resources: { [lang]: namespaces },interpolation: { escapeValue: false } });
document.documentElement.lang=lang;
const longTitle=lang==="ko"? "2026_긴 대회명과 개최지 정보를 보존하는 산악 그란폰도_122.91km_참가 목표와 거리":"2026_An exceptionally long mountain gran fondo event title retaining place and distance_122.91km";
function Shell() { const loc=useLocation(); return <div style={{ height: "100dvh",display: "flex",flexDirection: "column" }}><p style={{ margin: 0,padding: "var(--space-2) var(--space-4)" }}>LOCAL FIXTURE · no account or API</p><main className="site-main flex-1 overflow-x-hidden overflow-y-auto relative pb-[calc(54px+env(safe-area-inset-bottom,0px))] lg:pb-0"><Routes><Route path="/:lang/athlete/me/activities" element={<Records />} /><Route path="/:lang/coach/plan" element={<Plan />} /><Route path="/:lang/activity/:id" element={<ActivityDetail />} /><Route path="/:lang/coach/analysis" element={<Analysis />} /><Route path="/:lang/coach/run30" element={<Run30 />} /><Route path="/:lang/coach/evidence" element={<ResponsiveEvidence />} /></Routes><span aria-hidden="true" data-testid="fixture-last" style={{ display: "block",height: 1 }} /></main><MobileTabBar active="coach" /><output hidden data-testid="fixture-location">{loc.pathname}{loc.search}</output></div>; }
function Records() {
  const [params,setParams]=useSearchParams(); const [state,setState]=useState(fixture.get("state")??"ready");
  const selected=params.get("date")??"2026-10-22"; const [year,month]=selected.split("-").map(Number);
  const activities: Activity[]=Array.from({ length: count },(_,i) => ({ id: `record-${i}`,type: i%7===0? "Run":"Ride",description: `Record ${i} · ${longTitle}`,startTime: Date.parse(`${year}-${String(month).padStart(2,"0")}-22T09:00:00+09:00`)+i*1000,summary: { distance: 10000,ridingTimeMillis: 3600000 } } as Activity));
  return <><PlanRecordNavigation date={selected} /><div style={{ display: "flex",gap: "var(--space-2)",padding: "var(--space-2)",flexWrap: "wrap" }}>{["ready","loading","error"].map(value => <Button key={value} variant="secondary" onClick={() => setState(value)}>Fixture {value}</Button>)}</div>{state==="error"? <ErrorState title="Fixture read error" onRetry={() => setState("ready")} />:<MobileLogPage activities={activities} plannedDates={count? [`${year}-${String(month).padStart(2,"0")}-22`]:[]} plansByDate={count? { [`${year}-${String(month).padStart(2,"0")}-22`]: [{ discipline: "bike",workout: "z2",plannedTSS: 30,plannedDurationMin: 45,completed: true,executionStatus: "partial",actualActivityId: "record-0",actualTSS: 10,matchMethod: "manual",matchConfidence: "manual" }] }:{}} year={year!} month={month!-1} loading={state==="loading"} onChangeMonth={delta => { const next=new URLSearchParams(params); const date=new Date(Date.UTC(year!,month!-1+delta,22)); next.set("date",date.toISOString().slice(0,10)); setParams(next); }} />}</>;
}
function ActivityDetail() { const { id }=useParams(); return <section className="site-shell"><h1>Fixture activity {id}</h1><p>{longTitle}</p><CoachDetailSection id="activity-analysis" title="Fixture saved activity analysis"><p>Cadence stability · synthetic saved value</p></CoachDetailSection></section>; }
function Plan() { const [params]=useSearchParams(); const [offset,setOffset]=useState(0); const [edit,setEdit]=useState<PlanDay|null>(null); const sport=params.get("sport")==="run"? "run":"bike"; const date=Date.parse("2026-10-22T00:00:00+09:00"); const days=Array.from({ length: 7 },(_,i) => ({ date: date+i*86400000,dayOfWeek: i as 0|1|2|3|4|5|6,workout: i===6? "rest" as const:sport==="run"? "easyRun" as const:"z2" as const,plannedTSS: 30,plannedDurationMin: 45,completed: false,skipped: false,...(i===0? { executionStatus: "partial" }:{}) })); const model={ discipline: sport,goal: { id: "fixture-goal",title: longTitle,goalType: "event",discipline: sport },goalDate: new Date(date+30*86400000),weeks: [{ id: "fixture-week",weekNumber: 1,phase: "base",startDate: date,plannedTSS: 210,days }],loading: false,loadError: null,goalMatchesDiscipline: true,revalidating: false,justRecomputed: false,daysLeft: 30,totalTSS: 210,completedTSS: 20,progress: 10,weeksLeft: 4,isTodayCell: (day: PlanDay) => planDayKey(day.date)==="2026-10-22" } as unknown as PlanModel; return <><PlanRecordNavigation date={params.get("date")??"2026-10-22"} /><PlanPresentation model={model} selectedDate={params.get("date")??undefined} mobileWeekOffset={offset} onMobileWeekOffsetChange={setOffset} onEditWorkout={setEdit} />{edit&&<Text role="status">Fixture edit target {planDayKey(edit.date)}</Text>}</>; }
function Analysis() { const nav=useNavigate(); return <section className="site-shell"><h1>Fixture analysis</h1><FtpProgressionCard stableSelection points={[{ period: "2026-08",ftpW: 240,source: "20m" },{ period: "2026-09",ftpW: 250,source: "20m" }]} history={[{ id: "fixture-ftp",changedAt: Date.UTC(2026,8,1),value: 255,source: "manual" }]} currentFtpW={255} breakthrough={null} showHistory /><CoachDetailSection id="fixture-detail" title="Fixture long detail and keyboard"><label>Fixture date<DateField portal value="2026-10-22" onChange={() => { }} /></label><DropdownSelect label="Fixture option" value="a" options={[{ value: "a",label: longTitle },{ value: "b",label: "Other saved entry" }]} onChange={() => { }} /><fieldset disabled><legend>Fixture loading criteria <Button>Fixture legend action</Button></legend><Button>Fixture disabled child</Button><input aria-label="Fixture disabled input" /></fieldset>{Array.from({ length: 20 },(_,i) => <p key={i}>Saved evidence {i}: {longTitle}</p>)}<Button onClick={() => nav(-1)}>Fixture browser back</Button></CoachDetailSection></section>; }
function ResponsiveEvidence() { if (fixture.has("help")) return <HelpFixture />; return <ResponsiveEvidenceContent />; }
function HelpFixture() { if(fixture.has("load")) return <LoadHelpFixture />; return <section className="site-shell"><h1>Help fixture</h1><InfoTip title="FTP" label="Explain FTP" content="Saved threshold explanation.">FTP</InfoTip><InfoTip label="Explain CTL" content="Load definition">CTL</InfoTip><InfoTip title="Long explanation" label="Explain long text" content={Array(60).fill("Saved threshold explanation. ").join("")} /> <p data-testid="help-neighbor">Stable neighboring content</p><button>Outside help</button><div style={{height:"150vh"}} /></section>; }
function ResponsiveEvidenceContent() { const mobile=useMobile(); const [params]=useSearchParams(); const [mounted,setMounted]=useState(fixture.get("state")!=="delayed"); const sport=params.get("sport")==="run"? "run":"bike"; return <section className="site-shell"><h1>Fixture responsive evidence</h1><span data-testid="responsive-mode">{mobile? "mobile":"desktop"}</span><CoachDetailRouteNotice discipline={sport} />{!mounted&&<Button onClick={() => setMounted(true)}>Fixture mount evidence</Button>}{mounted&&sport==="bike"&&<>{mobile? <CoachDetailSection id="analysis-model" title="Fixture model basis"><p>Fixture stored model evidence</p></CoachDetailSection>:<AnchoredDetailsSection queryDetail id="analysis-model" title="Fixture model basis"><p>Fixture stored model evidence</p></AnchoredDetailsSection>}<FtpDecisionSection anchorEnabled compact={mobile} collapsible={!mobile} title="Fixture FTP basis"><p>Fixture stored FTP evidence</p><FtpProgressionCard stableSelection points={[{ period: "2026-08",ftpW: 240,source: "20m" },{ period: "2026-09",ftpW: 250,source: "20m" }]} currentFtpW={250} breakthrough={null} /></FtpDecisionSection></>}</section>; }
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><ThemeProvider><OriderThemeProvider><LocaleProvider userId={null}><BrowserRouter><Shell /></BrowserRouter></LocaleProvider></OriderThemeProvider></ThemeProvider></I18nextProvider>);

function Run30() {
  const mobile=useMobile(); const embedded=fixture.has("embed");
  const sessions: Run30Session[]=Array.from({ length: 24 },(_,i) => ({ stage: i+1,localDate: new Date(Date.UTC(2026,9,1+i*2)).toISOString().slice(0,10),status: i<10? "completed":"planned",previousAttemptSessionIds: [],workoutName: `${i+1}단계 걷기·달리기`,durationSec: 1800,segments: [{ stepId: "warm",label: "준비 걷기",durationSec: 300,targetType: "NONE" },{ stepId: "run",label: "편안한 달리기",durationSec: 1500,targetType: "NONE" }] }));
  return <section className="site-shell"><h1>Fixture Run30</h1><Run30StageList stableDetails={mobile&&!embedded} viewModel={{ completedStages: 10,totalStages: 24,progress: 10/24,todayKind: "start",next: sessions[10]!,pastSessions: sessions.slice(0,10),upcomingSessions: sessions.slice(11),retryCountForNext: 0 }} /></section>;
}

function LoadHelpFixture() {
 const block=sufficiencyBlock({featureId:"load_history",viewId:"form",state:"low_evidence",source:{basis:"estimated",assumedInputs:[]},nextAction:{code:"record_activity"},requirements:[{requirementId:"load_days",kind:"count",guarantee:"sufficient",satisfaction:"met",target:{value:1,unit:"day"},current:{value:300,unit:"day"}},{requirementId:"load_history_period",kind:"period",guarantee:"sufficient",satisfaction:"met",target:{value:42,unit:"day"},current:{value:42,unit:"day"}},{requirementId:"load_quality",kind:"quality",guarantee:"unpredictable",satisfaction:"not_met"}]});
 return <section className="site-shell"><SufficiencyInline set={sufficiencySet([block])} block={block} testId="load-quality" /><IntegratedLoadCard condition combined={{ctl:40,atl:35,tsb:5,contributions:[{discipline:"bike",ctl:30},{discipline:"run",ctl:10}]}} focus={{windowDays:28,totalLoad:100,buckets:{baseAerobic:40,highAerobic:30,highIntensity:20,unclassified:10},sourceLoad:{power:60,heartRate:30,unclassified:10},disciplineLoad:{bike:75,run:25,swim:0,other:0},activityCount:1000,coveragePct:90,confidence:"high",hasAnaerobicBikeDetail:true}} /><p data-testid="load-last">Last load evidence</p><button>Outside load</button></section>;
}
