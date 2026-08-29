import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("embedded Fitness and Plan sharing boundaries", () => {
  it("uses the same Fitness model and mobile presentation as the normal page", () => {
    const page = read("src/pages/FitnessPage.tsx");
    const surface = read("src/embedded/surfaces/FitnessSurface.tsx");

    // 닫는 괄호까지 고정하면 훅에 옵션 인자가 붙을 때마다 깨진다 — 호출 사실만 본다.
    expect(page).toContain("useFitnessModel(searchParams.get(\"sport\")");
    expect(surface).toContain("useFitnessModel(searchParams.get(\"sport\")");
    expect(page).toContain("<MobileFitnessPage");
    expect(surface).toContain("<MobileFitnessPage");
    expect(surface).not.toMatch(/from\s+["'][^"']*pages\/FitnessPage["']/);
    expect(surface).not.toContain("TodayTrainingDecisionCard");
  });

  it("uses the same Plan model and presentation without page-only action modules", () => {
    const page = read("src/pages/PlanPage.tsx");
    const surface = read("src/embedded/surfaces/PlanSurface.tsx");
    const presentation = read("src/features/training/plan/PlanPresentation.tsx");
    const mobileContent = read("src/features/training/plan/MobilePlanContent.tsx");

    expect(page).toContain("usePlanModel(searchParams.get(\"sport\"))");
    expect(surface).toContain("usePlanModel(searchParams.get(\"sport\"))");
    expect(page).toContain("<PlanPresentation");
    expect(surface).toContain("<PlanPresentation");
    expect(surface).not.toMatch(/from\s+["'][^"']*pages\/PlanPage["']/);
    expect(mobileContent).toContain('{!embedded && <div style={{ height: 80 }} />}');
    for (const forbidden of [
      "TodayTrainingDecisionCard",
      "WorkoutEditModal",
      "AdaptationBanner",
      "AddPlanSheet",
      "icsExport",
      "services/firebase",
    ]) {
      expect(presentation).not.toContain(forbidden);
      expect(surface).not.toContain(forbidden);
    }
  });

  it("keeps each authorized surface behind its own lazy chunk", () => {
    const bootstrap = read("src/embedded/EmbeddedBootstrapRoot.tsx");

    expect(bootstrap).toContain('lazy(() => import("./surfaces/ActivityAnalysisSurface"))');
    expect(bootstrap).toContain('lazy(() => import("./surfaces/FitnessSurface"))');
    expect(bootstrap).toContain('lazy(() => import("./surfaces/PlanSurface"))');
  });

  it("never exposes the FTP accept action on the embedded surface", () => {
    // 임베드 provider 트리에는 ToastProvider 가 없다(AppRoot 가 의도적으로 제외).
    // useToast 는 컨텍스트 기본값을 돌려주므로 예외는 없지만 showToast 가 무동작이라,
    // 임베드에서 쓰기 액션을 노출하면 성공·실패 피드백이 조용히 사라진다.
    // 따라서 결정 자체를 넘기지 않아 액션이 렌더되지 않게 고정한다.
    const mobile = read("src/components/mobile/MobileFitnessPage.tsx");
    expect(mobile).toContain("ftpDecision={embedded ? null : ftpDecision}");
  });
});
