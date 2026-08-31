import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataPageConfig } from "@shared/types/deviceSettings";

const mocks = vi.hoisted(() => ({
  profiles: [] as Array<{ id: string; name: string }>,
  save: vi.fn(),
  canSave: true,
  targetConfig: null as DataPageConfig | null,
  toasts: [] as string[],
}));

vi.mock("../../hooks/useBikeProfiles", () => ({
  useBikeProfiles: () => ({ profiles: mocks.profiles, loading: false }),
}));
vi.mock("../../hooks/useBikeProfileLayout", () => ({
  useBikeProfileLayout: () => ({
    config: mocks.targetConfig,
    source: "canonical",
    revision: 1,
    loading: false,
    canSave: mocks.canSave,
    save: mocks.save,
  }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: (m: string) => mocks.toasts.push(m) }),
}));

import { LegacyLayoutImportWizard } from "./LegacyLayoutImportWizard";

const sourceConfig: DataPageConfig = {
  pages: [
    { columns: 4, rows: 4, fields: [{ type: "SPEED", col: 0, row: 0, colSpan: 2, rowSpan: 1 }] },
    { columns: 4, rows: 4, fields: [] },
  ],
};

function renderWizard(onDone = vi.fn()) {
  render(
    <LegacyLayoutImportWizard
      uid="uid-a"
      devices={[{ deviceId: "device-1", label: "device-1", config: sourceConfig }]}
      initialDeviceId="device-1"
      onDone={onDone}
    />,
  );
  return onDone;
}

/**
 * 기기 구성을 자전거로 가져오기 (#1943 §5.2, #1950).
 *
 * 가져오기는 대상 자전거의 구성을 **통째로 교체**한다. 미리보기와 확인 없이 실행하면 사용자는
 * 잃은 것을 되돌릴 방법이 없다.
 */
describe("LegacyLayoutImportWizard", () => {
  beforeEach(() => {
    mocks.profiles = [{ id: "road", name: "로드" }];
    mocks.save.mockReset().mockResolvedValue({ status: "synced" });
    mocks.canSave = true;
    mocks.targetConfig = { pages: [{ columns: 4, rows: 4, fields: [] }] };
    mocks.toasts.length = 0;
  });

  it("확인 전에는 아무것도 쓰지 않는다", async () => {
    renderWizard();

    await userEvent.selectOptions(screen.getByTestId("legacy-import-target"), "road");
    await userEvent.click(screen.getByTestId("legacy-import-start"));

    expect(screen.getByTestId("legacy-import-preview")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("확인하면 그 자전거로 교체한다", async () => {
    const onDone = renderWizard();

    await userEvent.selectOptions(screen.getByTestId("legacy-import-target"), "road");
    await userEvent.click(screen.getByTestId("legacy-import-start"));
    await userEvent.click(screen.getByTestId("legacy-import-confirm"));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]![0]).toEqual(sourceConfig.pages);
    expect(onDone).toHaveBeenCalled();
  });

  /** 실패를 성공으로 뭉개면 사용자는 옮겼다고 믿고 기기 구성을 지운다. */
  it("실패하면 완료로 닫지 않는다", async () => {
    mocks.save.mockResolvedValue({ status: "localSaveFailed", cause: new Error("nope") });
    const onDone = renderWizard();

    await userEvent.selectOptions(screen.getByTestId("legacy-import-target"), "road");
    await userEvent.click(screen.getByTestId("legacy-import-start"));
    await userEvent.click(screen.getByTestId("legacy-import-confirm"));

    await waitFor(() => expect(mocks.toasts.length).toBe(1));
    expect(onDone).not.toHaveBeenCalled();
  });

  /** 대상 레코드를 읽지 못했으면 가져오지 않는다 — 원문을 덮어쓴다. */
  it("대상을 읽지 못하면 막는다", async () => {
    mocks.canSave = false;
    renderWizard();

    await userEvent.selectOptions(screen.getByTestId("legacy-import-target"), "road");
    await userEvent.click(screen.getByTestId("legacy-import-start"));

    expect(screen.getByTestId("legacy-import-blocked")).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>("legacy-import-confirm").disabled).toBe(true);
  });

  it("자전거가 없으면 가져오기 자체를 열지 않는다", () => {
    mocks.profiles = [];
    renderWizard();

    expect(screen.getByTestId("legacy-import-no-bikes")).toBeTruthy();
  });
});
