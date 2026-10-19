import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("embedded Fitness and Plan sharing boundaries", () => {

  it("never exposes the FTP accept action on the embedded surface", () => {
    // 임베드 provider 트리에는 ToastProvider 가 없다(AppRoot 가 의도적으로 제외).
    // useToast 는 컨텍스트 기본값을 돌려주므로 예외는 없지만 showToast 가 무동작이라,
    // 임베드에서 쓰기 액션을 노출하면 성공·실패 피드백이 조용히 사라진다.
    // 따라서 결정 자체를 넘기지 않아 액션이 렌더되지 않게 고정한다.
    const mobile = read("src/components/mobile/MobileFitnessPage.tsx");
    expect(mobile).toContain("ftpDecision={embedded ? null : ftpDecision}");
  });
});
