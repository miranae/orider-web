// 오라이더 웹 매뉴얼 생성기 — GitBook 스타일 셸(사이드바·검색·prev/next)로 전 챕터 재조합.
// 콘텐츠 소스: manual-src/ch*.html (본문 <section>), 용어집은 i18n analysis.glossary 에서 생성.
// 산출물: public/web-manual/{ch*,glossary,index}.html + search-index.json
//
// 실행: node scripts/gen-manual.mjs   (web/ 에서)  ·  npm run gen:manual
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "manual-src");
const OUT = resolve(root, "public/web-manual");
const SHOTS = "screenshots";

// ── 사이드바 구성(단일 소스) ───────────────────────────────
const GROUPS = [
  { name: "시작하기", pages: [{ file: "ch01-start.html", title: "1. 시작하기", level: "beginner", desc: "로그인, 메뉴 5개와 버튼, 종목 칩, 처음 해 둘 설정" }] },
  { name: "기록 보기", pages: [
    { file: "ch02-records.html", title: "2. 기록 보기 — 홈·운동일지·연간 기록", level: "beginner", desc: "최근 7일, 월 캘린더, 한 해 기록, 파일 올리기" },
    { file: "ch03-analysis.html", title: "3. 활동 분석 — 사이클·러닝", level: "beginner", desc: "지도·지표 카드, 분석·구간 탭, 편집·공개 범위" },
  ] },
  { name: "함께 달리기", pages: [
    { file: "ch04-compare.html", title: "4. 비교·탐색 — 코스·세그먼트·챌린지·게시판", level: "intermediate", desc: "다음 코스 고르기, 구간 순위, 거리 도전, 글쓰기" },
    { file: "ch05-group-event.html", title: "5. 클럽·친구·이벤트", level: "intermediate", desc: "클럽 가입·운영, 이번 주 순위, 친구 맺기, 대회" },
  ] },
  { name: "코치와 훈련", pages: [
    { file: "ch06-advanced.html", title: "6. 훈련 상태·체력 — 코치 > 훈련 상태·분석", level: "advanced", desc: "CTL·ATL·TSB, 파워 커브, 가정값, 훈련 기준값" },
    { file: "ch07-training.html", title: "7. 코치 — 오늘 운동·계획·목표·대화", level: "intermediate", desc: "목표 세우기, 주간 플랜, 오늘 고르기, AI 코치" },
    { file: "ch08-multisport.html", title: "8. 종목별 읽기·멀티스포츠", level: "intermediate", desc: "러닝 페이스·GAP·케이던스, 수영, 통합 부하" },
  ] },
  { name: "연결·설정", pages: [
    { file: "ch09-strava.html", title: "9. Strava·연결 앱", level: "beginner", desc: "연결, 과거 활동 가져오기, 자동 업로드, 헬스 소스" },
    { file: "ch10-settings.html", title: "10. 설정", level: "beginner", desc: "계정·공개 범위, 기기, API 키, 내보내기, 계정 삭제" },
  ] },
  { name: "참고", pages: [
    { file: "ch11-faq.html", title: "11. 자주 묻는 질문", level: "ref", desc: "기록이 안 보일 때, 숫자가 비었을 때, 메뉴 찾기" },
    { file: "glossary.html", title: "부록. 용어집", level: "ref", desc: "화면 용어와 표시(가정값·낮은 근거 등)의 뜻" },
  ] },
];

// 챕터별 스크린샷 ──────────────────────────────────────────
// at: 본문 <h3 id="…"> 바로 뒤에 삽입. at 이 없으면 순서대로 N번째 <h3> 앞에 삽입(이전 방식).
// max: 그림 최대 너비(px) — 휴대폰·좁은 화면 캡처가 본문 폭으로 늘어나지 않게.
// 캡처: 2026-10-17~18 본인 계정 위임 로그인(운영), 1440 너비(×2) 화면을 장면 단위로 잘라 0.5배 저장.
const FIGURES = {
  "ch01-start.html": [
    { at: "s1-3", img: "01-dashboard.png", cap: "홈 화면 위쪽 — 메뉴 5개(홈·코치·클럽·탐색·게시판), 오른쪽 위 버튼, 종목 칩(사이클·러닝·수영 준비 중), 최근 7일 활동. 아래 최근 활동 피드는 그림에서 잘라 냈습니다." },
    { at: "s1-3", img: "web-create-menu.png", max: 230, cap: "+ 만들기를 누르면 펼쳐지는 메뉴 — 코스·세그먼트·이벤트·클럽 만들기, 글쓰기, 활동 가져오기, 목표 만들기." },
    { at: "s1-6", img: "web-mobile-home.png", max: 390, cap: "휴대폰 브라우저의 홈 — 메뉴가 화면 아래쪽 탭으로 바뀝니다. 맨 위 카드의 '통합'은 모든 종목 합계라는 뜻입니다(피드 부분은 잘라 내고 아래쪽 탭을 이어 붙였습니다)." },
  ],
  "ch02-records.html": [
    { at: "s2-3", img: "04-log-calendar.png", cap: "운동일지(화면 제목: 운동 기록) — 점선 상자 '계획 N TSS'와 그 끝의 ✓·! 표시로 계획대로 했는지 봅니다." },
    { at: "s2-5", img: "web-upload.png", cap: "+ 만들기 > 활동 가져오기로 여는 '활동 업로드' 창 — 파일 선택(FIT·GPX·TCX 10MB, ZIP 100MB), 활동 이름, 공개 범위(전체·친구·비공개), 업로드 버튼." },
    { at: "s2-4", img: "web-records.png", max: 700, cap: "연간 기록 — 오른쪽 위 연도와 통합·사이클·러닝·수영 칩. '90일 일관성' 카드는 최근 90일 기준입니다." },
  ],
  "ch03-analysis.html": [
    { at: "s3-1", img: "02-activity-overview.png", cap: "사이클 활동 상세 — 맨 위 카드(성과 카드 이미지 저장, ▶ ⋯ 메뉴), 지도, 지표 카드. 지도 아래 '이 경로로 라이드'." },
    { at: "s3-3", img: "03-activity-analysis.png", cap: "사이클 활동의 분석 탭 — 3시간 넘게 FTP 근처 강도(IF 1.00)로 탄 라이딩이라 훈련 부하 TSS가 301로 큽니다. 아래 파워 분석의 평균 파워 120W와 NP 183W 차이(VI 1.52)는 강약이 큰 라이딩이라는 뜻입니다." },
    { at: "s3-8", img: "web-activity-edit.png", max: 660, cap: "활동 편집 화면 아래쪽 — 공개 설정(전체 공개·팔로워만·비공개), 세부(대회·레이스 활동, 체감 강도 RPE 1–10), 활동 삭제·취소·변경사항 저장." },
    { at: "s3-run", img: "web-run-laps.png", cap: "러닝 활동의 구간 탭 — 이 기록은 랩 정보가 연결되지 않아 랩 분석 표가 비어 있고, 지나간 세그먼트도 없어 세그먼트 만들기·코스 등록 버튼이 보이는 예입니다." },
  ],
  "ch04-compare.html": [
    { at: "s4-1", img: "web-courses.png", cap: "탐색 > 코스 — 필터(노면·이동거리·획득고도·지역·내 주변·체감난도)와 지도, 오른쪽 코스 목록(거리당상승·Cat 등급)." },
    { at: "s4-2", img: "web-segments.png", cap: "탐색 > 세그먼트 — 사이클·러닝 전환, 전체·힐클라임·평지 필터, 지도 위 히트맵 버튼, 오른쪽 '이 영역의 세그먼트' 목록." },
    { at: "s4-5", img: "web-recipes.png", cap: "탐색 > 기록 활용 — AI 일기 생성·게시글로 공유와, 아래 '다른 활용 방법' 카드 4개." },
    { at: "s4-8", img: "web-board.png", cap: "게시판 위쪽 — 검색 칸, 글 종류 버튼(내 글·전체·작업일지·문의/신고·이맘쯤 우리는), 오른쪽 위 글쓰기." },
  ],
  "ch05-group-event.html": [
    { at: "s5-1", img: "web-clubs.png", cap: "클럽 목록 위쪽 — 참여 중인 클럽 수, 오른쪽 위 클럽 찾기·클럽 만들기, 내 클럽 종목·검색." },
    { at: "s5-2", img: "web-club.png", cap: "클럽 안 — 위쪽 메뉴(소식·이벤트·공동 기록·함께한 이번 주·멤버·운영)와 소식 탭의 클럽 공지와 소식." },
    { at: "s5-5", img: "web-events.png", cap: "탐색 > 이벤트 — 맨 위 진행 중·모집 중·내가 참가한 이벤트 수, 아래 목록·캘린더·지도 보기." },
    { at: "s5-6", img: "web-friends.png", max: 700, cap: "친구 위쪽 — 내 친구코드와 복사 아이콘, 친구코드 입력 칸, 친구·요청·보낸 요청 탭(친구 목록은 잘라 냈습니다)." },
  ],
  "ch06-advanced.html": [
    { at: "s6-1", img: "05-fitness-pmc.png", cap: "코치 > 훈련 상태 — 브리핑 결론과 장기체력 CTL·단기피로 ATL·회복상태 TSB. '낮은 근거' 표시와 남은 요건을 눈여겨보세요." },
    { at: "s6-3", img: "web-coach-analysis.png", cap: "코치 > 분석 — 왼쪽 기간별 실측 파워 비교, 오른쪽 파워 커브(최근 28일 실선, 이전 28일 점선)와 '확인할 지속시간'별 최고 파워." },
    { at: "s6-5", img: "web-condition-sections.png", cap: "코치 > 훈련 상태 아래쪽 — 최근 활동이 남긴 영향과 접힌 영역들. '전체 종목 훈련 기준 설정'과 'FTP·파워 판단 근거'를 눌러 펼칩니다." },
  ],
  "ch07-training.html": [
    { at: "s7-2", img: "web-today.png", cap: "코치 > 오늘 운동 — 세 가지 중 하나를 고르면 24·48시간 뒤 CTL·ATL·TSB 예상이 바뀝니다. 계획 결정·실행 기능은 준비 중입니다." },
    { at: "s7-3", img: "08-training-plan.png", cap: "코치 > 계획(주간 플랜) — 목표일이 하루 남은 예시라 띠 제목이 '목표일 이후 저장된 운동'으로, 지난 미완료 수가 크게 보입니다. 훈련 단계 막대와 TODAY·★ 목표일 칸을 찾아보세요." },
    { at: "s7-4", img: "web-goals.png", cap: "코치 > 목표 — 지금 목표 카드의 계획진행률·목표일 예상, 아래 '다른 목표를 세우려면'." },
  ],
  "ch09-strava.html": [
    { at: "s9-1", img: "web-settings-connections.png", max: 820, cap: "설정 > 연결 앱의 활동 앱 연결 카드 — Strava 줄의 '연결' 버튼을 누릅니다." },
  ],
  "ch10-settings.html": [
    { at: "s10-1", img: "web-settings-account-manage.png", max: 820, cap: "설정 > 계정 맨 아래 계정 관리 — 로그아웃, 데이터 관리, 빨간 '계정 삭제 안내 및 요청'." },
    { at: "s10-2", img: "web-settings-device.png", cap: "설정 > 기기 — 왼쪽 설정 목록(나·연결·앱)과 기기 카드. '모든 기기' 표시는 내 모든 기기에 적용된다는 뜻입니다." },
    { at: "s10-5", img: "web-settings-developer.png", cap: "설정 > 개발자 — 키 이름, 허용할 데이터, 키 생성. 새 키는 만든 직후 한 번만 전체 값이 보입니다." },
    { at: "s10-8", img: "web-account-deletion.png", max: 700, cap: "계정 및 데이터 삭제 화면 — 맨 위 이메일 요청 안내, '삭제 범위와 처리 안내'. 아래로 내려 DELETE 입력과 요청 버튼이 있습니다." },
  ],
};

const LEVEL_LABEL = { beginner: "초급", intermediate: "중급", advanced: "고급" };
// 본문과 속성(alt 등) 양쪽에 쓰이므로 따옴표까지 바꾼다 — 캡션에 "…" 가 들어가면 alt 가 끊긴다.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ── 용어집 본문 생성(i18n 단일 소스) ───────────────────────
const G_GROUPS = [
  { title: "훈련 부하 · 강도", keys: ["tss", "if", "work", "kjPerHour", "trimp", "sufferScore", "recovery", "duration"] },
  { title: "파워", keys: ["avgPower", "maxPower", "np", "xpower", "vi", "wkgAvg", "wkgNp", "cp", "wprime", "wPrimeBal", "matches", "matchesTime", "longestMatch", "longestZ4", "quadrant", "pedalBalance", "torqueEffectiveness", "pedalSmoothness", "platformCenterOffset", "powerPhase", "dynamicsCoverage"] },
  { title: "심박 · 효율", keys: ["avgHr", "maxHr", "hrDrift", "ef", "decoupling"] },
  { title: "임계 영역 · 존", keys: ["sweetSpot", "threshold", "vo2max", "anaerobic", "zones"] },
  { title: "에너지 대사", keys: ["fatmax", "metabolism"] },
  { title: "운동 데이터", keys: ["distance", "elevGain", "avgSpeed", "maxSpeed", "avgRpm", "maxRpm", "cadenceConsistency", "paceConsistency", "fastestKm", "calories"] },
];
// " — " 구분자 없이 설명만 있는 i18n 항목의 용어명 / 쉬운 말로 바꾼 설명(전문어 풀이)
const KEY_TERMS = {
  sufferScore: ["고통 점수", "Suffer Score"],
  cadenceConsistency: ["케이던스 일관성", "Cadence consistency"],
  pedalBalance: ["페달 좌우 밸런스", "Pedal balance"],
  torqueEffectiveness: ["토크 효율", "Torque effectiveness"],
  pedalSmoothness: ["페달 부드러움", "Pedal smoothness"],
  platformCenterOffset: ["플랫폼 중심 오프셋", "PCO"],
  powerPhase: ["파워 페이즈", "Power phase"],
  dynamicsCoverage: ["센서 커버리지", "Dynamics coverage"],
  paceConsistency: ["페이스 일관성", "Pace consistency"],
  wPrimeBal: ["W′ 잔량", "W′ balance"],
  fastestKm: ["최고 1km", "Fastest km"],
  longestZ4: ["최장 Z4+ 구간", "Longest Z4+"],
  wprime: ["W′ (W 프라임)", "W′"],
  xpower: ["xPower", "xPower"],
};
const DESC_OVERRIDE = {
  longestZ4: "FTP의 91% 이상을 끊김 없이 유지한 가장 긴 시간. 역치(오래 버티는 힘) 지구력을 보는 지표입니다.",
  matches: "FTP를 크게 넘긴 짧고 강한 구간. 성냥처럼 한 번 쓰면 다시 쓰기 어려워, 한 번의 운동에서 낼 수 있는 횟수가 한정적입니다.",
  quadrant: "케이던스(페달 회전수)와 토크(페달을 미는 힘)를 기준으로 4칸에 머문 시간 비율. Q4(낮은 회전·큰 힘)가 많으면 힘으로 미는 타입, Q1(높은 회전·높은 출력)이 많으면 빠르게 돌리며 세게 타는 타입입니다.",
  wprime: "임계 파워(CP)를 넘겨 쓸 수 있는 무산소 에너지 저장량(kJ). 다 쓰면 CP 아래로 내려 쉬어야 다시 찹니다.",
  xpower: "NP처럼 들쭉날쭉한 힘을 보정한 파워. 최근 약 25초 동안의 힘에 더 무게를 둬 계산합니다.",
  wPrimeBal: "무산소 여유 힘(W′)이 운동 중 얼마나 남았는지 시간에 따라 보여 주는 선. 임계 파워(CP)보다 세게 달리면 줄고, 약하게 달리면 다시 찹니다. 가장 낮은 점이 0%에 가까울수록 한계까지 짜낸 것입니다.",
  metabolism: "운동 중 지방과 탄수화물을 각각 얼마나 썼는지 추정한 비율. 숨 쉴 때 내쉬는 기체 비율(호흡교환율)을 바탕으로 한 일반적인 평균값이라 개인차가 있습니다.",
};
function parseEntry(content, key) {
  const sep0 = content.indexOf(" — ");
  if (KEY_TERMS[key]) return { term: KEY_TERMS[key][0], en: KEY_TERMS[key][1], desc: DESC_OVERRIDE[key] ?? content.trim() };
  const sep = content.indexOf(" — ");
  const head = sep >= 0 ? content.slice(0, sep) : content;
  const desc = sep >= 0 ? content.slice(sep + 3) : "";
  const m = head.match(/^(.+?)\s*(?:\(([^)]+)\))?\s*$/);
  return { term: (m?.[1] ?? head).trim(), en: (m?.[2] ?? "").trim(), desc: desc.trim() };
}
function glossaryContent() {
  const json = JSON.parse(readFileSync(resolve(root, "src/i18n/resources/ko/activity.json"), "utf8"));
  const g = json?.analysis?.glossary ?? {};
  let secs = "";
  const runningTerms = [
    ["페이스", "Pace", "1km에 걸리는 시간(분/km). 5:00/km가 6:00/km보다 빠릅니다. 수영은 분/100m로 구분합니다."],
    ["스플릿·랩", "Split / Lap", "활동을 나눈 구간의 거리와 시간. 원본 랩 데이터가 있어야 표시되며 마지막 짧은 구간은 따로 해석합니다."],
    ["러닝 케이던스", "Running cadence", "분당 걸음 수(spm). 자전거 페달 회전수(rpm)와 다릅니다. 보폭·접지 시간 추정과 실측값을 구분하세요."],
    ["임계 페이스", "Threshold pace", "러닝 강도·페이스 존을 정하는 개인 기준(분/km). 역치 심박 LTHR(bpm)과 단위가 다릅니다."],
    ["경사 보정 페이스", "GAP", "경사의 영향을 보정한 추정 페이스. 실제 기록 시간과 다르며 GPS·고도 데이터에 영향을 받습니다."],
    ["러닝 부하", "rTSS", "러닝 활동으로 산출한 훈련 부하. 자전거 파워 기반 TSS와 산출 근거가 다르므로 자신의 추세와 함께 확인합니다."],
    ["거리별 개인 기록", "Distance PR", "특정 거리 구간의 확정 최고 시간. 활동 전체 평균과 구분하며 데이터가 없으면 미산출로 표시됩니다."],
    ["임계 페이스 곡선", "Critical pace curve", "지속 시간별로 낼 수 있었던 가장 빠른 평균 페이스를 이은 선. 짧게 달릴수록 빠르고 길게 달릴수록 느려집니다."],
  ];
  const dataTerms = [
    ["장기체력", "CTL", "최근 약 6주 부하의 평균. 천천히 오르면 체력이 쌓이는 중입니다. 코치 > 훈련 상태에서 봅니다."],
    ["단기피로", "ATL", "최근 약 1주 부하의 평균. 강한 주에 빠르게 오릅니다."],
    ["회복상태", "TSB", "장기체력 − 단기피로. 음수면 피로, 양수면 회복된 상태입니다."],
    ["훈련 기준값", "Threshold", "FTP·임계 페이스·CSS·최대 심박·LTHR처럼 존과 부하 계산의 기준이 되는 개인 값. 코치 > 훈련 상태 > 전체 종목 훈련 기준 설정에서 넣습니다."],
    ["파워-지속시간 곡선", "PDC", "1초~1시간 각 시간 동안 낸 최고 평균 파워를 이은 곡선. 파워 커브와 라이더 능력 3축의 근거입니다."],
    ["가정값", "Assumed value", "내가 입력하지 않은 기준값(체중·FTP 등)을 기본값으로 넣어 계산했다는 표시. 내 값을 넣으면 사라집니다."],
    ["가정값 시작값", "Assumed baseline", "계획·목표의 출발점을 가정값으로 잡았다는 표시. '기준값 입력·확인'으로 바꿉니다."],
    ["낮은 근거", "Low evidence", "계산은 했지만 일부를 심박·시간으로 추정하는 등 근거가 약하다는 표시."],
    ["데이터 부족", "Insufficient data", "계산에 필요한 최소 기록이 아직 없다는 표시. 카드의 '남은 요건'을 채우면 열립니다."],
    ["미산출", "Not calculated", "근거가 없어 그 항목만 계산하지 않았다는 뜻. 0점이 아닙니다."],
    ["가상 파워", "Virtual power", "파워미터 없이 속도·경사·체중·자전거 무게로 추정한 파워. 실측 파워 계산에서는 빠집니다."],
  ];
  secs += `    <h3>훈련 상태 · 데이터 상태</h3>\n    <div class="card"><table><tr><th>용어</th><th>영문</th><th>설명</th></tr>\n${dataTerms.map(([term, en, desc]) => `      <tr><td><strong>${esc(term)}</strong></td><td>${esc(en)}</td><td>${esc(desc)}</td></tr>`).join("\n")}\n    </table></div>\n`;
  secs += `    <h3>러닝 · 종목별 기록</h3>\n    <div class="card"><table><tr><th>용어</th><th>영문</th><th>설명</th></tr>\n${runningTerms.map(([term, en, desc]) => `      <tr><td><strong>${esc(term)}</strong></td><td>${esc(en)}</td><td>${esc(desc)}</td></tr>`).join("\n")}\n    </table></div>\n`;
  const used = new Set();
  for (const grp of G_GROUPS) {
    let rows = "";
    for (const k of grp.keys) {
      if (!(k in g)) continue; used.add(k);
      const parsed = parseEntry(g[k], k);
      const term = parsed.term, en = parsed.en || "—", desc = DESC_OVERRIDE[k] ?? parsed.desc;
      if (!term || !desc) throw new Error(`[gen-manual] 용어집 빈 칸: ${k}`);
      rows += `        <tr><td><strong>${esc(term)}</strong></td><td>${esc(en)}</td><td>${esc(desc)}</td></tr>\n`;
    }
    if (rows) secs += `    <h3>${esc(grp.title)}</h3>\n    <div class="card"><table>\n        <tr><th>용어</th><th>영문</th><th>설명</th></tr>\n${rows}      </table></div>\n`;
  }
  const leftover = Object.keys(g).filter((k) => !used.has(k));
  if (leftover.length) console.warn("[gen-manual] 미분류 용어:", leftover.join(", "));
  return `<section id="glossary">
  <h2>부록. 용어집</h2>
  <div class="purpose"><h4>이 장에서 할 수 있는 것</h4><p>화면에서 본 낯선 용어와 표시(가정값·낮은 근거 등)의 뜻을 찾아봅니다. 화면 지표의 <strong>ⓘ</strong>를 눌러도 그 자리에서 설명을 볼 수 있습니다.</p></div>
  <div class="tip">파워·FTP 기반 설명은 사이클에, 페이스·임계 페이스 기반 설명은 러닝에 적용합니다. 브라우저 찾기(Ctrl+F / ⌘+F)로 용어를 바로 찾을 수 있습니다.</div>
${secs}</section>`;
}

// PNG 머리(IHDR)에서 가로·세로를 읽어 width/height 속성으로 넣는다(레이아웃 밀림 방지).
function pngSize(file) {
  const b = readFileSync(resolve(OUT, SHOTS, file));
  if (b.toString("ascii", 12, 16) !== "IHDR") throw new Error(`[gen-manual] PNG 아님: ${file}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ── 본문에 figure 삽입(at: 해당 <h3 id> 뒤 / 없으면 N번째 <h3> 앞, 부족하면 끝에 append) ──
function injectFigures(html, figs, file) {
  if (!figs || !figs.length) return html;
  let out = html;
  figs.forEach((f, k) => {
    const style = f.max ? ` style="max-width:${f.max}px;margin-inline:auto"` : "";
    const { w, h } = pngSize(f.img);
    const snippet = `\n  <figure class="gb-fig"${style}><img src="${SHOTS}/${f.img}" width="${w}" height="${h}" alt="${esc(f.cap)}" loading="lazy"><figcaption>${esc(f.cap)}</figcaption></figure>\n  `;
    if (f.at) {
      const head = out.indexOf(`<h3 id="${f.at}"`);
      if (head < 0) throw new Error(`[gen-manual] ${file}: 그림 위치 h3#${f.at} 없음`);
      // 같은 at 에 여러 장이면 앞서 넣은 그림 뒤에 이어 붙인다.
      let idx = out.indexOf("</h3>", head) + 5;
      while (out.startsWith(`\n  <figure class="gb-fig"`, idx)) idx = out.indexOf("</figure>\n  ", idx) + 12;
      out = out.slice(0, idx) + snippet + out.slice(idx);
      return;
    }
    let count = 0, idx = -1, from = 0;
    while (count < k + 1) { idx = out.indexOf("<h3", from); if (idx < 0) break; count++; from = idx + 3; }
    if (idx < 0) out = out.replace("</section>", snippet + "</section>");
    else out = out.slice(0, idx) + snippet + out.slice(idx);
  });
  return out;
}

// ── 사이드바 HTML(현재 페이지 active) ──────────────────────
function sidebar(currentFile) {
  let nav = "";
  for (const grp of GROUPS) {
    nav += `      <div class="gb-group"><div class="gb-group-title">${esc(grp.name)}</div>\n`;
    for (const p of grp.pages) {
      const badge = LEVEL_LABEL[p.level] ? ` <span class="lvl level-${p.level}">${LEVEL_LABEL[p.level]}</span>` : "";
      nav += `        <a class="gb-link${p.file === currentFile ? " active" : ""}" href="${p.file}">${esc(p.title)}${badge}</a>\n`;
    }
    nav += `      </div>\n`;
  }
  return `    <aside class="gb-sidebar" id="sidebar">
      <a class="gb-brand" href="index.html">O·RIDER <span>웹 설명서</span></a>
      <div class="gb-search"><input id="q" type="search" placeholder="검색…" autocomplete="off"><div id="results" class="gb-results"></div></div>
      <nav class="gb-nav">
${nav}      </nav>
    </aside>`;
}

const storeLinks = `<div class="manual-store-links" aria-label="Orider 앱 설치">
        <span>자전거·러닝 기록은 Orider 앱에서 시작합니다.</span>
        <a href="https://apps.apple.com/kr/app/o-rider/id6775696052" target="_blank" rel="noopener">App Store</a>
        <a href="https://play.google.com/store/apps/details?id=com.miranae.orider" target="_blank" rel="noopener">Google Play</a>
      </div>`;

// ── 페이지 셸 ──────────────────────────────────────────────
function page({ file, title, group, contentInner, prev, next }) {
  const crumb = `<b>${esc(group)}</b> · ${esc(title)}`;
  const prevHtml = prev
    ? `<a class="pn-prev" href="${prev.file}"><div class="pn-label">← 이전</div><div class="pn-title">${esc(prev.title)}</div></a>`
    : `<a class="pn-prev" href="index.html"><div class="pn-label">←</div><div class="pn-title">목차</div></a>`;
  const nextHtml = next
    ? `<a class="pn-next" href="${next.file}"><div class="pn-label">다음 →</div><div class="pn-title">${esc(next.title)}</div></a>`
    : `<a class="pn-next" href="index.html"><div class="pn-label">→</div><div class="pn-title">목차로</div></a>`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} - 오라이더 웹 설명서</title>
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="gitbook.css">
</head>
<body>
<div class="gb">
${sidebar(file)}
  <div class="gb-backdrop" id="backdrop"></div>
  <div class="gb-main">
    <header class="gb-topbar">
      <button class="gb-menu" id="menuBtn" aria-label="메뉴">☰</button>
      <div class="gb-crumb">${crumb}</div>
      <a class="gb-applink" href="https://orider.co.kr" target="_blank" rel="noopener">오라이더 웹 열기 ↗</a>
    </header>
    <main class="gb-content">
${contentInner}
      <nav class="gb-prevnext">${prevHtml}${nextHtml}</nav>
      ${storeLinks}
    </main>
  </div>
</div>
<script src="manual.js"></script>
</body>
</html>
`;
}

// ── 빌드 ───────────────────────────────────────────────────
const flat = [];
for (const grp of GROUPS) for (const p of grp.pages) flat.push({ ...p, group: grp.name });

const searchIndex = [];
for (let i = 0; i < flat.length; i++) {
  const p = flat[i];
  let content = p.file === "glossary.html" ? glossaryContent() : readFileSync(resolve(SRC, p.file), "utf8").trim();
  content = injectFigures(content, FIGURES[p.file], p.file);
  // 검색용 소제목 + 본문 전문(전체 텍스트 검색)
  const headings = [...content.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const text = content.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  searchIndex.push({ url: p.file, title: p.title, group: p.group, headings, text });
  const indented = content.split("\n").map((l) => l.trim() ? "      " + l : "").join("\n");
  writeFileSync(resolve(OUT, p.file), page({
    file: p.file, title: p.title, group: p.group, contentInner: indented,
    prev: flat[i - 1], next: flat[i + 1],
  }));
}

// 랜딩(index.html)
const cards = flat.map((p) => `      <a class="toc-card" href="${p.file}"><div class="ch-info"><div class="ch-title">${esc(p.title)}</div><div class="ch-desc">${esc(p.desc ?? p.group)}</div></div></a>`).join("\n");
const landing = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>오라이더 웹 설명서</title>
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="gitbook.css">
</head>
<body>
<div class="gb">
${sidebar("index.html")}
  <div class="gb-backdrop" id="backdrop"></div>
  <div class="gb-main">
    <header class="gb-topbar">
      <button class="gb-menu" id="menuBtn" aria-label="메뉴">☰</button>
      <div class="gb-crumb"><b>오라이더 웹 설명서</b></div>
      <a class="gb-applink" href="https://orider.co.kr" target="_blank" rel="noopener">오라이더 웹 열기 ↗</a>
    </header>
    <main class="gb-content">
      <div class="gb-hero">
        <h1>오라이더 웹 설명서</h1>
        <p>사이클과 러닝 기록을 확인하고, 훈련 상태를 읽고, 코치와 함께 다음 운동을 정하는 방법을 처음부터 차례로 안내합니다. <strong>앱에서 기록하고, 웹에서 되짚어 봅니다.</strong></p>
      </div>
      <div class="info">왼쪽 목차(휴대폰에서는 위쪽 <strong>☰ 메뉴</strong>)에서 장을 고르거나, 목차의 <strong>검색</strong>으로 용어·메뉴 이름을 바로 찾으세요. 2026년 10월 화면 기준이며, 그림은 실제 계정 화면입니다.</div>
      <div class="card"><h3>처음이라면 이 순서로</h3><ol><li><a href="ch01-start.html#s1-2">로그인</a>하고 <a href="ch01-start.html#s1-3">메뉴 5개</a>를 둘러봅니다.</li><li><a href="ch01-start.html#s1-5">처음 해 둘 설정</a> — 훈련 기준값, 공개 범위, 기록 가져오기.</li><li><a href="ch02-records.html">홈·운동일지</a>에서 내 기록을 찾고 <a href="ch03-analysis.html">활동 상세</a>를 엽니다.</li><li><a href="ch06-advanced.html#s6-1">코치 &gt; 훈련 상태</a>에서 오늘 상태를 보고, <a href="ch07-training.html#s7-4">목표</a>를 세웁니다.</li></ol></div>
      <div class="card"><h3>하고 싶은 일로 찾기</h3><ul><li><strong>러닝 시작:</strong> <a href="ch01-start.html#s1-5">러닝을 처음 확인할 때</a> → <a href="ch03-analysis.html#s3-run">페이스·구간 읽기</a> → <a href="ch07-training.html#s7-4">러닝 대회·30분 달리기</a></li><li><strong>사이클 실력 보기:</strong> <a href="ch03-analysis.html#s3-5">파워 읽기</a> → <a href="ch06-advanced.html#s6-3">파워 커브</a> → <a href="ch04-compare.html#s4-2">세그먼트 순위</a></li><li><strong>숫자가 비었거나 '가정값'이 보일 때:</strong> <a href="ch06-advanced.html#s6-4">데이터 충분도·가정값</a></li><li><strong>함께 달리기:</strong> <a href="ch05-group-event.html">클럽·친구·이벤트</a></li><li><strong>내 데이터 관리:</strong> <a href="ch10-settings.html#s10-5">API 키</a> · <a href="ch10-settings.html#s10-7">내보내기·삭제</a> · <a href="ch10-settings.html#s10-8">계정 삭제 요청</a></li></ul><p>휴대폰 앱 사용법은 <a href="/manual/">앱 설명서</a>에 있습니다.</p></div>
      <div class="gb-cards">
${cards}
      </div>
      ${storeLinks}
    </main>
  </div>
</div>
<script src="manual.js"></script>
</body>
</html>
`;
writeFileSync(resolve(OUT, "index.html"), landing);
writeFileSync(resolve(OUT, "search-index.json"), JSON.stringify(searchIndex));

console.log(`[gen-manual] ${flat.length} pages + index + search-index (${searchIndex.length} entries)`);
const figCount = Object.values(FIGURES).reduce((n, a) => n + a.length, 0);
console.log(`[gen-manual] figures injected: ${figCount}`);
