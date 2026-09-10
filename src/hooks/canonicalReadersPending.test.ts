import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 아직 화면에 붙지 않은 정본 reader 들 (#884 / #887 — 에픽 app#2237).
 *
 * 이 훅·함수들은 서버 정본을 읽는 경로를 미리 하나로 고정해 두려고 먼저 만들어졌고, **지금
 * 프로덕션 소비자가 없다.** 조용히 방치되면 "붙어 있는 줄 알았는데 아니었다" 가 되므로
 * (이 PR 의 `useActivityMetrics` 결함이 바로 그 모양이었다) 여기에 목록으로 남긴다.
 *
 * 화면에 붙이는 작업은 별개다 — 홈/피트니스의 어떤 숫자를 정본으로 갈아탈지, 상태별로 무엇을
 * 그릴지 결정이 필요하고, 그 결정 없이 붙이면 미계산을 0 으로 그리는 결함이 되돌아온다.
 * 붙일 때는 **`homeSummary` 서버 전환 판정 + 빌드 플래그** 뒤에 두고, 아래 목록에서 지운다.
 * 소비자가 생기면 이 테스트가 실패해 목록 갱신을 강제한다.
 *
 * 2026-09-08 (#2237 리뷰): `useCanonicalHomeSummary` 와 `fetchCanonicalFitnessSummary` 는
 * DashboardPage 의 최근 7일 KPI 네 칸과 체력(CTL/TSB) 칸에 붙었다 — `homeSummary` 판정 +
 * `canonicalConsumersEnabled` 빌드 플래그 뒤이고, 상태별 표시는
 * `src/features/home/canonicalKpiSource.ts` 한 곳에서 정한다. 그래서 목록에서 지운다.
 */
const PENDING_READERS = [
  // src/hooks/useMaintenanceSnapshot.ts — 웹에 정비 화면 자체가 없다.
  "useMaintenanceSnapshot",
] as const;

const SRC = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

describe("canonical readers awaiting a production consumer", () => {
  it.each(PENDING_READERS)("%s 는 아직 어떤 화면도 쓰지 않는다 (연결 시 목록에서 지울 것)", (symbol) => {
    const importers = sourceFiles(SRC).filter((path) => {
      const source = readFileSync(path, "utf8");
      // 선언 파일 자신은 제외 — import 로 끌어다 쓰는 곳만 소비자다.
      return new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`).test(source);
    });
    expect(importers).toEqual([]);
  });
});
