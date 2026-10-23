import { test,expect,type APIRequestContext,type Page } from "@playwright/test";
import { planDayKey } from "../../shared/training/planDate";

const project="demo-orider-coach-local",auth="http://127.0.0.1:19199",store="http://127.0.0.1:18180";
const email=`coach-local-${Date.now()}@example.invalid`,emptyEmail=`coach-empty-${Date.now()}@example.invalid`,largeEmail=`coach-large-${Date.now()}@example.invalid`,password="local-fixture-only-password";
const now=Date.now(),day=planDayKey(now),start=Date.parse(`${day}T00:00:00+09:00`);
function field(value: unknown): Record<string,unknown> { if(value===null) return { nullValue: null }; if(typeof value==="string") return { stringValue: value }; if(typeof value==="boolean") return { booleanValue: value }; if(typeof value==="number") return Number.isInteger(value)? { integerValue: String(value) }:{ doubleValue: value }; if(Array.isArray(value)) return { arrayValue: { values: value.map(field) } }; return { mapValue: { fields: fields(value as Record<string,unknown>) } }; }
function fields(value: Record<string,unknown>) { return Object.fromEntries(Object.entries(value).map(([key,val]) => [key,field(val)])); }
async function put(request: APIRequestContext,path: string,data: Record<string,unknown>) { const result=await request.patch(`${store}/v1/projects/${project}/databases/(default)/documents/${path}`,{ headers: { Authorization: "Bearer owner" },data: { fields: fields(data) } }); expect(result.ok()).toBe(true); }
test.beforeAll(async ({ request }) => {
  const result=await request.post(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key`,{ data: { email,password,returnSecureToken: true } }); expect(result.ok()).toBe(true); const uid=(await result.json()).localId as string;
  await put(request,`users/${uid}`,{ nickname: "Local Coach Fixture",email,locale: "ko",units: "metric",timezone: "Asia/Seoul",createdAt: now-30*86400000,ftp: 240,weightKg: 70,defaultVisibility: "private",stravaConnected: false,friendCode: "LOCALONLY",thresholdPace: 300 });
  for(let index=0;index<15;index++)await put(request,`activities/local-record-${index}`,{ userId: uid,type: index%4===3? "Run":"Ride",description: `Local synthetic activity ${index}`,startTime: start-(index%7)*86400000+index*60000,endTime: start-(index%7)*86400000+index*60000+3600000,createdAt: now,deletedAt: null,visibility: "private",source: "orider",localSessionId: `local-session-${index}`,summary: { distance: 10000+index*500,ridingTimeMillis: 3600000,...(index===0? {}:{ averagePower: 180 }),elevationGain: 100 },photoCount: 0,commentCount: 0,kudosCount: 0,thumbnailTrack: "" });
  await put(request,`goals/local-goal`,{ userId: uid,discipline: "bike",goalType: "event",title: "2026_긴 대회명과 개최지 정보를 보존하는 로컬 검수 그란폰도_122.91km",courseId: null,courseName: "Local fixture course",courseDist: 123,courseElev: 1000,eventType: "completion",eventDate: start+30*86400000,targetDate: start+30*86400000,weeklySessions: 4,status: "active",createdAt: now-7*86400000,updatedAt: now,snapshot: { ftp: 240,weightKg: 70,ctl: 40 },feasibility: { label: "on_track",computedAt: now } });
  await put(request,"goals/local-goal/plan/week-01",{ weekNumber: 1,phase: "base",startDate: start-2*86400000,plannedTSS: 180,days: Array.from({ length: 7 },(_,i) => ({ date: start+(i-2)*86400000,dayOfWeek: i,workout: i===6? "rest":"z2",plannedTSS: i===6? 0:30,plannedDurationMin: i===6? 0:45,completed: false,skipped: false,...(i===2? { completed: true,executionStatus: "partial",actualActivityId: "local-record-0",actualTSS: 10,matchMethod: "manual",matchConfidence: "manual" }:{}) })) });
  await put(request,"activity_metrics/local-record-0",{ version: 36,discipline: "bike",activityType: "Ride",computedAt: now,startTime: start,np: null,avgPower: null,cyclingMetrics: { cadenceStdDev: 7.2 } });
  const emptyResult=await request.post(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key`,{ data: { email: emptyEmail,password,returnSecureToken: true } }); expect(emptyResult.ok()).toBe(true); const emptyUid=(await emptyResult.json()).localId as string;
  await put(request,`users/${emptyUid}`,{ nickname: "Local Empty Fixture",email: emptyEmail,locale: "ko",units: "metric",timezone: "Asia/Seoul",createdAt: now,defaultVisibility: "private",friendCode: "EMPTYLOCAL" });
  const largeAuth=await request.post(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key`,{ data: { email: largeEmail,password,returnSecureToken: true } });
  expect(largeAuth.ok()).toBe(true); const largeUid=(await largeAuth.json()).localId as string;
  await put(request,`users/${largeUid}`,{ nickname: "Local Large Fixture",email: largeEmail,locale: "ko",units: "metric",timezone: "Asia/Seoul",createdAt: now,defaultVisibility: "private",friendCode: "LARGELOCAL" });
  for(let offset=0;offset<1000;offset+=500) {
    const writes=Array.from({ length: 500 },(_,j) => { const index=offset+j; return { update: { name: `projects/${project}/databases/(default)/documents/activities/local-large-${index}`,fields: fields({ userId: largeUid,type: "Ride",description: `Large synthetic activity ${index}`,startTime: start+index*1000,endTime: start+index*1000+600000,createdAt: now,deletedAt: null,visibility: "private",source: "orider",localSessionId: `large-session-${index}`,summary: { distance: 1000+index,ridingTimeMillis: 600000 },photoCount: 0,commentCount: 0,kudosCount: 0,thumbnailTrack: "" }) } }; });
    const commit=await request.post(`${store}/v1/projects/${project}/databases/(default)/documents:commit`,{ headers: { Authorization: "Bearer owner" },data: { writes } }); expect(commit.ok()).toBe(true);
  }
  await put(request,`users/${uid}/fitness/timeseries_bike`,{ discipline: "bike",schemaVersion: 1,computedAt: now,startDate: new Date(now-90*86400000).toISOString().slice(0,10),endDate: new Date(now).toISOString().slice(0,10),pointCount: 91,points: Array.from({ length: 91 },(_,i) => ({ date: new Date(now-(90-i)*86400000).toISOString().slice(0,10),ctl: 35+i/20,atl: 40+i/30,tsb: -5+i/60,dailyLoad: 40 })) });
});
async function enter(page: Page,width: number,path: string,loginEmail=email) {
  await page.setViewportSize({ width,height: 900 });
  await page.route("**/*",route => { const url=new URL(route.request().url()); return ["127.0.0.1","localhost"].includes(url.hostname)&&["5193","19199","18180","15001","19198"].includes(url.port)? route.continue():route.abort(); });
  await page.route("**/runtime-config.json*",route => route.fulfill({ json: { firebaseApiKey: "fake-local-key",firebaseProjectId: project,firebaseAuthDomain: `${project}.firebaseapp.com`,firebaseStorageBucket: `${project}.appspot.com`,firebaseAppId: "1:123:web:local",firebaseFunctionsRegion: "us-central1",appEnvironment: "e2e",useEmulators: true,activityAnalysisExpansionEnabled: false,canonicalConsumersEnabled: false,canonicalRolloutEnabled: false } }));
  await page.goto(`/ko${path}`);
  await page.waitForFunction(() => typeof (window as unknown as { __e2eSignIn?: unknown; }).__e2eSignIn==="function");
  await page.evaluate(async ({ email,password }) => { await (window as unknown as { __e2eSignIn: (email: string,password: string) => Promise<unknown>; }).__e2eSignIn(email,password); },{ email: loginEmail,password });
}
for(const width of [320,393,768,1440,1920]) {
  test(`real app records ${width}px: local emulator, route and bottom`,async ({ page },info) => {
    await enter(page,width,`/athlete/me/activities?sport=bike&date=${day}`);
    await expect(page.getByRole("link",{ name: "활동 기록·수행 확인",exact: true })).toBeVisible();
    await expect(page.getByRole("button",{ name: /^Local synthetic activity 14\b/ }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ animations: "disabled",path: info.outputPath("records-start.png") });
    await page.locator(".site-main").evaluate(node => { node.scrollTop=node.scrollHeight; });
    await page.screenshot({ animations: "disabled",path: info.outputPath("records-end.png") });
  });
  test(`real app plan ${width}px: plan/record date and sport`,async ({ page },info) => {
    await enter(page,width,`/coach/plan?sport=bike&date=${day}`);
    await expect(page.getByText(/로컬 검수 그란폰도/).first()).toBeVisible();
    const records=page.getByRole("link",{ name: "활동 기록·수행 확인",exact: true }); await expect(records).toHaveAttribute("href",`/ko/athlete/me/activities?sport=bike&date=${day}`); await records.click();
    await expect(page.getByRole("link",{ name: "훈련 계획",exact: true })).toHaveAttribute("href",`/ko/coach/plan?sport=bike&date=${day}`);
    await page.goBack(); await expect(page.getByText(/로컬 검수 그란폰도/).first()).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow","6");
    await page.screenshot({ animations: "disabled",path: info.outputPath("plan-start.png") });
  });
}


for(const width of [320,393,768,1440,1920]) {
  for(const route of ["condition","analysis","goals"]) {
    test(`real app ${route} ${width}px: first to last with partial data`,async ({ page },info) => {
      const errors: string[]=[]; page.on("pageerror",error => errors.push(error.message));
      await enter(page,width,`/coach/${route}?sport=bike`);
      await expect(page.locator("h1").first()).toBeVisible();
      if(route==="goals") await expect(page.getByTestId("K3-1")).toBeVisible();
      if(route==="condition") await expect(page.getByTestId("K1-2")).toBeVisible();
      if(route==="analysis") { await expect(page.locator("#ftp-decision")).toBeVisible(); await expect(page.getByRole("combobox",{ name: "분석할 라이딩" })).toHaveCount(0); }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({ animations: "disabled",path: info.outputPath(`${route}-start.png`) });
      await page.locator(".site-main").evaluate(node => { node.scrollTop=node.scrollHeight; });
      await page.screenshot({ animations: "disabled",path: info.outputPath(`${route}-end.png`) });
      expect(errors).toEqual([]);
    });
  }
  test(`real app empty goal ${width}px: first valid creation step without saving`,async ({ page },info) => {
    await enter(page,width,"/coach/goals?sport=bike",emptyEmail);
    await expect(page.getByTestId("K3-2-1")).toBeEnabled();
    await expect(page.getByTestId("K3-1")).toHaveCount(0);
    await page.screenshot({ animations: "disabled",path: info.outputPath("empty-goals.png") });
    await page.getByTestId("K3-2-1").click();
    await expect(page.getByTestId("K3-3")).toBeVisible();
    const createCourse=page.getByRole("link",{ name: "코스 만들기",exact: true });
    await expect(createCourse).toHaveAttribute("href","/ko/course/create");
    await createCourse.evaluate(node => node.scrollIntoView({ block: "center" }));
    await expect(createCourse).toBeInViewport();
    await createCourse.click({ trial: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ animations: "disabled",path: info.outputPath("first-goal-step.png") });
  });
}

for(const width of [320,393,768,1440,1920]) {
  test(`real activity analysis ${width}px: saved cadence without power, back to records`,async ({ page },info) => {
    await enter(page,width,`/athlete/me/activities?sport=bike&date=${day}`);
    await expect(page.getByRole("button",{ name: /^Local synthetic activity 14\b/ }).first()).toBeVisible();
    await page.goto("/ko/activity/local-record-0");
    await page.getByRole("tab",{ name: "분석",exact: true }).click();
    await expect(page.getByText("케이던스 일관성",{ exact: true })).toBeVisible();
    await expect(page.getByText("rpm σ",{ exact: true })).toBeVisible();
    await page.getByText("케이던스 일관성",{ exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText("케이던스 일관성",{ exact: true })).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ animations: "disabled",path: info.outputPath("activity-analysis-cadence.png") });
    await page.goBack();
    await expect(page.getByRole("tab",{ name: "개요",exact: true })).toHaveAttribute("aria-selected","true");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`activities\\?sport=bike&date=${day}`));
  });
}

for(const width of [320,393,768,1440,1920]) {
  test(`real settings ${width}px: stored threshold and final device link without saving`,async ({ page },info) => {
    await enter(page,width,"/settings/training?sport=bike");
    await expect(page.getByRole("textbox",{ name: "FTP",exact: true })).toHaveValue("240");
    await page.screenshot({ animations: "disabled",path: info.outputPath("training-settings-start.png") });
    const device=page.getByRole("link",{ name: "기기 반영 상태 보기 →",exact: true });
    await device.evaluate(node => node.scrollIntoView({ block: "center" })); await expect(device).toBeInViewport();
    await expect(device).toHaveAttribute("href","/ko/settings/device");
    await page.screenshot({ animations: "disabled",path: info.outputPath("training-settings-end.png") });
  });
  test(`real chat ${width}px: unavailable local service remains an explicit read error`,async ({ page },info) => {
    await enter(page,width,"/coach/chat?sport=bike");
    await expect(page.getByText("대화 내역을 불러오지 못했습니다.",{ exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ animations: "disabled",path: info.outputPath("chat-service-unavailable.png") });
  });
}

for(const width of [1440,1920]) {
  test(`real desktop records ${width}px: 1000 activities stay bounded across history`,async ({ page },info) => {
    await enter(page,width,`/athlete/me/activities?sport=bike&date=${day}`,largeEmail);
    const rows=page.getByRole("button",{ name: /^Large synthetic activity \d+ ·/ });
    await expect(rows).toHaveCount(2);
    await page.getByRole("button",{ name: "외 998건 보기",exact: true }).click();
    await expect(rows).toHaveCount(20);
    const pager=page.getByRole("navigation",{ name: "이 날짜의 활동 페이지",exact: true });
    await expect(pager).toContainText("1–20");
    await pager.getByRole("button",{ name: "다음 기록",exact: true }).click();
    await expect(pager).toContainText("21–40");
    await expect(page).toHaveURL(/calendarPage=2/);
    await rows.first().click();
    await expect(page.getByRole("heading",{ name: "Large synthetic activity 20",exact: true })).toBeVisible();
    await page.goBack(); await expect(pager).toContainText("21–40"); await expect(rows).toHaveCount(20);
    await page.reload(); await expect(pager).toContainText("21–40");
    const last=new URL(page.url()); last.searchParams.set("calendarPage","50"); await page.goto(last.href);
    await expect(rows).toHaveCount(20); await expect(pager).toContainText("981");
    expect(await page.locator(".site-main").evaluate(node => node.scrollHeight)).toBeLessThan(6000);
    const finalRecord=page.getByRole("button",{ name: /^Large synthetic activity 999 ·/ });
    await finalRecord.scrollIntoViewIfNeeded(); await expect(finalRecord).toBeInViewport();
    await page.screenshot({ animations: "disabled",path: info.outputPath("desktop-1000-last-page.png") });
    await finalRecord.click(); await expect(page.getByRole("heading",{ name: "Large synthetic activity 999",exact: true })).toBeVisible();
    await page.goBack(); await expect(pager).toContainText("981"); await expect(rows).toHaveCount(20);
  });
}

for(const width of [320,393,768,1440,1920]) {
  test(`real next adjustment ${width}px: completed partial day to next workout, no save`,async ({ page },info) => {
    await enter(page,width,`/coach/plan?sport=bike&date=${day}`);
    await expect(page.getByText(/로컬 검수 그란폰도/).first()).toBeVisible();
    const nextWorkout=page.getByRole("button",{ name: width<1024? "편집":"운동 상세",exact: true }).first();
    await expect(nextWorkout).toBeEnabled(); await nextWorkout.click();
    const dialog=page.getByRole("dialog"); await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`date=${planDayKey(start+86400000)}`));
    await page.screenshot({ animations: "disabled",path: info.outputPath("next-workout-edit-entry.png") });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await expect(nextWorkout).toBeFocused();
    const records=page.getByRole("link",{ name: "활동 기록·수행 확인",exact: true });
    await expect(records).toHaveAttribute("href",`/ko/athlete/me/activities?sport=bike&date=${planDayKey(start+86400000)}`);
    await records.click(); await page.goBack(); await expect(page).toHaveURL(new RegExp(`date=${planDayKey(start+86400000)}`));
    await page.reload(); await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
