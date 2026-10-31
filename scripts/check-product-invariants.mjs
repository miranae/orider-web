/**
 * 제품 원칙 가드 — docs/product-invariants.md 의 [검사] 항목을 기계로 확인한다.
 *
 * 방식은 래칫이다. 원칙 이전부터 있던 파일은 ALLOW 에 고정하고, 그 밖의 파일에서 패턴이
 * 나오면 실패한다. ALLOW 에 있는데 더 이상 패턴이 없는 파일도 실패한다(목록을 실제와 맞춘다).
 * 이 파일과 원칙 문서를 바꾼 PR 은 merge-pr.sh 가 관리자 승인을 요구한다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const RULES = [
  {
    id: "P1",
    title: "공개 범위는 visibility 하나 — 지표 숨김(hideHr·hidePower) 필드를 쓰지 않는다",
    pattern: /\bhide(?:Hr|Power)\b/u,
    // 2026-10-31 남은 사용처(Strava 기록 가리기·캐시 키)를 정리했다 — 허용 없음.
    allow: {},
  },
  {
    id: "P4",
    title: "localStorage 키는 uid 로 나눈다 — 새 파일의 직접 사용은 리뷰와 허용 목록 등록이 필요하다",
    pattern: /\blocalStorage\b/u,
    allow: {
      "src/App.tsx": "", "src/components/redesign/DisciplineTabs.tsx": "", "src/contexts/ThemeContext.tsx": "계정 무관(테마)",
      "src/embedded/trainingSurfaceCache.ts": "", "src/features/board/postDraft.ts": "",
      "src/features/club-preparation/domain.ts": "", "src/features/club-preparation/meetingCopy.ts": "",
      "src/features/club-preparation/meetingDrafts.ts": "", "src/hooks/useActiveBikeProfile.ts": "",
      "src/hooks/useDashboardPreferences.ts": "", "src/hooks/useDefaultSport.ts": "", "src/hooks/useFirstSyncCelebration.ts": "",
      "src/i18n/detector.ts": "계정 무관(언어)", "src/i18n/index.ts": "계정 무관(언어)", "src/pages/event/EventLivePage.tsx": "",
      "src/services/analytics.ts": "", "src/services/impersonation.ts": "", "src/theme/OriderThemeProvider.tsx": "계정 무관(테마)",
      "src/utils/activityFilter.ts": "",
    },
  },
  {
    id: "P5",
    title: "위임 로그인 토큰은 #impersonateToken= fragment 로만 받는다",
    pattern: /impersonateToken/u,
    allow: {
      "src/main.tsx": "", "src/services/appHandoff.ts": "", "src/services/impersonation.ts": "", "src/services/sentry.ts": "토큰 가리기",
    },
    // 허용 파일 안에서도 쿼리에서 토큰을 읽으면 안 된다.
    forbidEverywhere: /(?:searchParams|URLSearchParams\([^)]*search[^)]*\))\s*\.\s*(?:get|has)\(\s*["'`]impersonateToken/u,
    guardTest: { file: "src/services/impersonation.test.ts", mustContain: "?impersonateToken=" },
  },
  {
    id: "P10",
    title: "활동 지도 썸네일은 브라우저 캡처 — 지도 이미지 API(Static API)를 쓰지 않는다",
    pattern: /api\.mapbox\.com\/styles\/v1\/[^\s"'`]*\/static|maps\.googleapis\.com\/maps\/api\/staticmap/u,
    allow: { "src/pages/EventsPage.tsx": "이벤트 카드 경로 미리보기(활동 썸네일 아님)" },
  },
];

const SOURCE = /\.(?:ts|tsx|js|jsx|mjs)$/u;
const TEST = /(?:\.test\.|\.spec\.|__tests__\/)/u;

export function scanFiles(files, read, rules = RULES) {
  const problems = [];
  for (const rule of rules) {
    const hits = new Set();
    for (const file of files) {
      if (!SOURCE.test(file) || TEST.test(file)) continue;
      const text = read(file);
      if (rule.forbidEverywhere?.test(text)) problems.push(`${rule.id} ${file}: 쿼리 문자열에서 토큰을 읽습니다 — ${rule.title}`);
      if (!rule.pattern.test(text)) continue;
      hits.add(file);
      if (!(file in rule.allow)) problems.push(`${rule.id} ${file}: ${rule.title}`);
    }
    for (const file of Object.keys(rule.allow)) {
      if (!hits.has(file)) problems.push(`${rule.id} ${file}: 허용 목록에 있지만 더 이상 해당 코드가 없습니다 — 목록에서 빼세요`);
    }
    if (rule.guardTest) {
      let text = "";
      try { text = read(rule.guardTest.file); } catch { /* 없음 */ }
      if (!text.includes(rule.guardTest.mustContain)) problems.push(`${rule.id} ${rule.guardTest.file}: 원칙을 지키는 테스트(${rule.guardTest.mustContain})가 없습니다`);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "src", "shared"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const problems = scanFiles(files, file => readFileSync(file, "utf8"));
  if (problems.length) {
    console.error(`제품 원칙 검사 실패 ${problems.length}건 (docs/product-invariants.md):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("원칙을 바꾸려면 원칙 문서·이 스크립트를 고치는 PR 로 관리자 승인을 받으세요.");
    process.exit(1);
  }
  console.log(`제품 원칙 검사 통과 (${RULES.map(rule => rule.id).join(", ")})`);
}
