// O-Rider 웹 매뉴얼 생성기 — GitBook 스타일 셸(사이드바·검색·prev/next)로 전 챕터 재조합.
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
    { file: "ch02-records.html", title: "2. 라이딩 기록 확인", level: "beginner" },
    { file: "ch03-analysis.html", title: "3. 활동 상세 분석", level: "intermediate" },
  ] },
  { name: "비교와 이해", pages: [
    { file: "ch04-compare.html", title: "4. 데이터 비교·이해", level: "intermediate" },
    { file: "ch05-group-event.html", title: "5. 그룹·이벤트", level: "intermediate" },
  ] },
  { name: "심화", pages: [
    { file: "ch06-advanced.html", title: "6. 고급 데이터 활용", level: "advanced" },
    { file: "ch07-training.html", title: "7. 훈련 계획·기록", level: "intermediate" },
    { file: "ch08-multisport.html", title: "8. 멀티스포츠", level: "intermediate" },
  ] },
  { name: "연동·설정", pages: [
    { file: "ch09-strava.html", title: "9. Strava 연동", level: "beginner" },
    { file: "ch10-settings.html", title: "10. 설정", level: "intermediate" },
  ] },
  { name: "참고", pages: [{ file: "glossary.html", title: "부록. 용어집", level: "ref" }] },
];

// 챕터별 스크린샷(본문 N번째 <h3> 앞에 순서대로 삽입) ───────────
const FIGURES = {
  "ch01-start.html": [{ img: "01-dashboard.png", cap: "로그인 후 대시보드 — 내 라이딩과 주간 통계가 표시됩니다." }],
  "ch02-records.html": [{ img: "02-activity-overview.png", cap: "활동 상세 — 경로 지도와 핵심 지표." }],
  "ch03-analysis.html": [{ img: "03-activity-analysis.png", cap: "분석 탭 — 지표 카드와 영문 용어 ⓘ 툴팁." }],
  "ch04-compare.html": [{ img: "06-explore-leaderboard.png", cap: "리더보드 — 세그먼트 순위·KOM." }],
  "ch06-advanced.html": [{ img: "05-fitness-pmc.png", cap: "피트니스 — PMC(체력 CTL · 피로 ATL · 폼 TSB)." }],
  "ch07-training.html": [
    { img: "08-training-plan.png", cap: "운동 계획 — 주차별 캘린더와 일일 TSS 목표." },
    { img: "04-log-calendar.png", cap: "운동 기록 — 월간 캘린더로 보는 활동." },
  ],
  "ch10-settings.html": [{ img: "07-settings.png", cap: "설정 — 계정 · 운동 프로필 · 연동 · 앱." }],
};

const LEVEL_LABEL = { beginner: "초급", intermediate: "중급", advanced: "고급" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 용어집 본문 생성(i18n 단일 소스) ───────────────────────
const G_GROUPS = [
  { title: "훈련 부하 · 강도", keys: ["tss", "if", "work", "kjPerHour", "trimp", "sufferScore", "recovery", "duration"] },
  { title: "파워", keys: ["avgPower", "maxPower", "np", "xpower", "vi", "wkgAvg", "wkgNp", "cp", "wprime", "wPrimeBal", "matches", "matchesTime", "longestMatch", "longestZ4", "quadrant"] },
  { title: "심박 · 효율", keys: ["avgHr", "maxHr", "hrDrift", "ef", "decoupling"] },
  { title: "임계 영역 · 존", keys: ["sweetSpot", "threshold", "vo2max", "anaerobic", "zones"] },
  { title: "에너지 대사", keys: ["fatmax", "metabolism"] },
  { title: "운동 데이터", keys: ["distance", "elevGain", "avgSpeed", "maxSpeed", "avgRpm", "maxRpm", "cadenceConsistency", "paceConsistency", "calories"] },
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
  <div class="purpose"><h4>이 페이지의 목적</h4><p>분석 탭의 영문 지표 용어를 한곳에서 찾아봅니다. 각 지표 카드의 <strong>ⓘ</strong>에 마우스를 올리면 같은 설명이 툴팁으로도 표시됩니다.</p></div>
  <div class="tip">이 용어집은 분석 탭 ⓘ 툴팁과 <strong>동일한 i18n 소스(<code>analysis.glossary</code>)</strong>에서 자동 생성됩니다.</div>
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
<title>${esc(title)} - O-Rider 웹 매뉴얼</title>
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
  const indented = content.split("\n").map((l) => "      " + l).join("\n");
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
<title>O-Rider 웹 매뉴얼</title>
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
      <div class="gb-crumb"><b>O-Rider 웹 매뉴얼</b></div>
      <a class="gb-applink" href="https://orider.co.kr" target="_blank" rel="noopener">앱 열기 ↗</a>
    </header>
    <main class="gb-content">
      <div class="gb-hero">
        <h1>O-Rider 웹 매뉴얼</h1>
        <p>라이딩 이후 데이터를 분석하고 훈련을 관리하는 웹 플랫폼 사용 가이드. <strong>앱은 기록, 웹은 분석.</strong></p>
      </div>
      <div class="info">왼쪽 사이드바에서 장을 고르거나, 상단 <strong>검색</strong>으로 용어·기능을 바로 찾을 수 있습니다.</div>
      <div class="gb-cards">
${cards}
      </div>
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
