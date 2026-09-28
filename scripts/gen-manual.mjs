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
  { name: "시작하기", pages: [{ file: "ch01-start.html", title: "1. 웹 시작하기", level: "beginner" }] },
  { name: "기록 보기", pages: [
    { file: "ch02-records.html", title: "2. 자전거·러닝 기록 확인", level: "beginner" },
    { file: "ch03-analysis.html", title: "3. 활동 상세 분석", level: "intermediate" },
  ] },
  { name: "비교와 이해", pages: [
    { file: "ch04-compare.html", title: "4. 데이터 비교·이해", level: "intermediate" },
    { file: "ch05-group-event.html", title: "5. 그룹·이벤트", level: "intermediate" },
  ] },
  { name: "심화", pages: [
    { file: "ch06-advanced.html", title: "6. 고급 데이터 활용", level: "advanced" },
    { file: "ch07-training.html", title: "7. 훈련 계획·기록", level: "intermediate" },
    { file: "ch08-multisport.html", title: "8. 종목별 분석·멀티스포츠", level: "intermediate" },
  ] },
  { name: "연동·설정", pages: [
    { file: "ch09-strava.html", title: "9. Strava 연동", level: "beginner" },
    { file: "ch10-settings.html", title: "10. 설정", level: "intermediate" },
  ] },
  { name: "참고", pages: [{ file: "glossary.html", title: "부록. 용어집", level: "ref" }] },
];

// 챕터별 스크린샷(본문 N번째 <h3> 앞에 순서대로 삽입) ───────────
const FIGURES = {
  "ch01-start.html": [{ img: "01-dashboard.png", cap: "자전거 대시보드 예시 — 러닝은 종목을 바꿔 확인하세요." }],
  "ch02-records.html": [{ img: "02-activity-overview.png", cap: "자전거 활동 상세 예시 — 러닝 상세는 페이스·스플릿 기준입니다." }],
  "ch03-analysis.html": [{ img: "03-activity-analysis.png", cap: "자전거 분석 탭 예시 — 데이터가 있는 지표와 ⓘ 설명을 확인합니다." }],
  "ch04-compare.html": [{ img: "06-explore-leaderboard.png", cap: "자전거 세그먼트 리더보드 예시 — 순위·KOM." }],
  "ch06-advanced.html": [{ img: "05-fitness-pmc.png", cap: "피트니스 화면 예시 — 선택한 종목의 CTL·ATL·TSB를 확인합니다." }],
  "ch07-training.html": [
    { img: "08-training-plan.png", cap: "운동 계획 화면 예시 — 종목과 목표에 따라 일정 내용이 달라집니다." },
    { img: "04-log-calendar.png", cap: "운동 기록 — 월간 캘린더로 보는 활동." },
  ],
  "ch10-settings.html": [{ img: "07-settings.png", cap: "설정 — 계정 · 운동 프로필 · 연동 · 앱." }],
};

const LEVEL_LABEL = { beginner: "초급", intermediate: "중급", advanced: "고급" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 용어집 본문 생성(i18n 단일 소스) ───────────────────────
const G_GROUPS = [
  { title: "훈련 부하 · 강도", keys: ["tss", "if", "work", "kjPerHour", "trimp", "sufferScore", "recovery", "duration"] },
  { title: "파워", keys: ["avgPower", "maxPower", "np", "xpower", "vi", "wkgAvg", "wkgNp", "cp", "wprime", "wPrimeBal", "matches", "matchesTime", "longestMatch", "longestZ4", "quadrant", "pedalBalance", "torqueEffectiveness", "pedalSmoothness", "platformCenterOffset", "powerPhase", "dynamicsCoverage"] },
  { title: "심박 · 효율", keys: ["avgHr", "maxHr", "hrDrift", "ef", "decoupling"] },
  { title: "임계 영역 · 존", keys: ["sweetSpot", "threshold", "vo2max", "anaerobic", "zones"] },
  { title: "에너지 대사", keys: ["fatmax", "metabolism"] },
  { title: "운동 데이터", keys: ["distance", "elevGain", "avgSpeed", "maxSpeed", "avgRpm", "maxRpm", "cadenceConsistency", "paceConsistency", "fastestKm", "calories"] },
];
function parseEntry(content) {
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
    ["체력·피로·폼", "CTL / ATL / TSB", "누적 부하에서 산출하는 훈련 추세 지표. 체력 CTL, 최근 피로 ATL, 두 값의 차이 TSB를 종목별·통합으로 봅니다."],
  ];
  secs += `    <h3>러닝 · 종목별 기록</h3>\n    <div class="card"><table><tr><th>용어</th><th>영문</th><th>설명</th></tr>\n${runningTerms.map(([term, en, desc]) => `      <tr><td><strong>${esc(term)}</strong></td><td>${esc(en)}</td><td>${esc(desc)}</td></tr>`).join("\n")}\n    </table></div>\n`;
  const used = new Set();
  for (const grp of G_GROUPS) {
    let rows = "";
    for (const k of grp.keys) {
      if (!(k in g)) continue; used.add(k);
      const { term, en, desc } = parseEntry(g[k]);
      rows += `        <tr><td><strong>${esc(term)}</strong></td><td>${esc(en)}</td><td>${esc(desc)}</td></tr>\n`;
    }
    if (rows) secs += `    <h3>${esc(grp.title)}</h3>\n    <div class="card"><table>\n        <tr><th>용어</th><th>영문</th><th>설명</th></tr>\n${rows}      </table></div>\n`;
  }
  const leftover = Object.keys(g).filter((k) => !used.has(k));
  if (leftover.length) console.warn("[gen-manual] 미분류 용어:", leftover.join(", "));
  return `<section id="glossary">
  <h2>부록. 용어집</h2>
  <div class="purpose"><h4>이 페이지의 목적</h4><p>자전거와 러닝의 단위·페이스·부하 용어를 찾아봅니다. 분석 지표의 <strong>ⓘ</strong>에서는 해당 화면의 설명도 확인할 수 있습니다.</p></div>
  <div class="tip">러닝 용어와 분석 지표를 함께 정리했습니다. 파워·FTP 기반 설명은 자전거에 적용하고 러닝은 페이스·임계 페이스 기준으로 읽습니다.</div>
${secs}</section>`;
}

// ── 본문에 figure 삽입(N번째 <h3> 앞, 부족하면 끝에 append) ──
function injectFigures(html, figs) {
  if (!figs || !figs.length) return html;
  let out = html;
  figs.forEach((f, k) => {
    const snippet = `\n  <figure class="gb-fig"><img src="${SHOTS}/${f.img}" alt="${esc(f.cap)}" loading="lazy"><figcaption>${esc(f.cap)}</figcaption></figure>\n  `;
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
      <a class="gb-brand" href="index.html">O·RIDER <span>웹 매뉴얼</span></a>
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
<title>${esc(title)} - 오라이더 웹 매뉴얼</title>
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
      <a class="gb-applink" href="https://orider.co.kr" target="_blank" rel="noopener">앱 열기 ↗</a>
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
  content = injectFigures(content, FIGURES[p.file]);
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
const cards = flat.map((p) => `      <a class="toc-card" href="${p.file}"><div class="ch-info"><div class="ch-title">${esc(p.title)}</div><div class="ch-desc">${esc(p.group)}</div></div></a>`).join("\n");
const landing = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>오라이더 웹 매뉴얼</title>
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
      <div class="gb-crumb"><b>오라이더 웹 매뉴얼</b></div>
      <a class="gb-applink" href="https://orider.co.kr" target="_blank" rel="noopener">앱 열기 ↗</a>
    </header>
    <main class="gb-content">
      <div class="gb-hero">
        <h1>오라이더 웹 매뉴얼</h1>
        <p>자전거와 러닝의 기록을 확인하고, 속도·페이스·스플릿을 분석하며 훈련을 관리하는 가이드. <strong>앱에서 기록하고 웹에서 되짚어 봅니다.</strong></p>
      </div>
      <div class="info">왼쪽 목차(모바일에서는 상단 <strong>☰ 메뉴</strong>)를 열어 장을 고르거나, 목차의 <strong>검색</strong>으로 용어·기능을 바로 찾을 수 있습니다.</div>
      <div class="card"><h3>먼저 필요한 흐름을 선택하세요</h3><ul><li><strong>러닝 시작:</strong> <a href="ch01-start.html#s1-5">계정·종목 확인</a> → <a href="ch03-analysis.html#s3-run">페이스·스플릿 분석</a> → <a href="ch07-training.html">목표와 계획</a></li><li><strong>자전거 기록:</strong> <a href="ch02-records.html">활동 찾기</a> → <a href="ch03-analysis.html">속도·심박·파워 분석</a> → <a href="ch04-compare.html">세그먼트·코스 비교</a></li><li><strong>두 종목 병행:</strong> <a href="ch08-multisport.html">종목별 기준과 통합 부하</a>를 확인하세요.</li></ul><p>매뉴얼의 기존 화면 이미지는 자전거 또는 공통 화면 예시입니다. 러닝에서는 실제 표시되는 종목·단위·데이터 상태를 기준으로 읽으세요.</p></div>
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
