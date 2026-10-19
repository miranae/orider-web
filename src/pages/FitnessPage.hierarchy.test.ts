import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FitnessPage canonical FTP acceptance boundary", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8");
  const modelSource = readFileSync(join(process.cwd(), "src/hooks/useFitnessModel.ts"), "utf8");

  it("accepts FTP through the server decision without local rider-metric persistence", () => {
    // FTP 결정 수락은 useFitnessModel 로 추출됐다 — 페이지가 아니라 훅을 본다.
    expect(modelSource).toContain("await acceptBikeThresholdDecision(user.uid, bikeFtpDecision)");
    expect(modelSource).not.toContain("persistRiderMetrics");
    expect(source).not.toContain("persistRiderMetrics");
  });
});
