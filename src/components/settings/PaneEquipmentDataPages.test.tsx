import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profiles: [] as Array<Record<string, unknown>>,
  save: vi.fn(),
  layoutState: {} as Record<string, unknown>,
  toasts: [] as string[],
}));

vi.mock("../../hooks/useActiveBikeProfile", () => ({
  useActiveBikeProfile: () => ({
    active: mocks.profiles[0] ?? null,
    profiles: mocks.profiles,
    loading: false,
    setActive: vi.fn(),
    setAccountDefault: vi.fn(),
    defaultProfileId: null,
    updateVirtualPower: vi.fn(),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    updateWheelCircumference: vi.fn(),
    removeSensor: vi.fn(),
  }),
}));
vi.mock("../../hooks/useBikeProfileLayout", () => ({
  useBikeProfileLayout: () => mocks.layoutState,
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "uid-a" }, profile: { weightKg: 70 } }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: (m: string) => mocks.toasts.push(m) }),
}));
vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));
vi.mock("./LayoutEditorCard", () => ({
  LayoutEditorCard: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="layout-editor" data-readonly={String(Boolean(readOnly))} />
  ),
}));

import { PaneEquipment } from "./PaneEquipment";

function profile(id: string, name: string) {
  return {
    id,
    name,
    sensors: [],
    wheelCircumferenceMm: 2105,
    virtualPower: { enabled: false },
    createdAt: 0,
    updatedAt: 0,
  };
}

function renderPane(initialEntry = "/settings/equipment") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PaneEquipment />
    </MemoryRouter>,
  );
}

/**
 * 데이터 페이지 편집기의 진입 (#1943 §5.1, #1950).
 *
 * 데이터 페이지는 **자전거의 속성**이다. 기기 화면에 두면 자전거를 바꿔도 같은 배치가 따라다니고,
 * 사용자는 자전거별 구성이 저장되지 않는다고 읽는다.
 */
describe("PaneEquipment 데이터 페이지", () => {
  beforeEach(() => {
    mocks.profiles = [profile("road", "로드"), profile("gravel", "그래블")];
    mocks.toasts.length = 0;
    mocks.layoutState = {
      config: { pages: [{ columns: 4, rows: 4, fields: [] }] },
      source: "canonical",
      revision: 3,
      loading: false,
      canSave: true,
      save: mocks.save,
    };
  });

  it("자전거 행에서 데이터 페이지를 연다", async () => {
    renderPane();

    await userEvent.click(screen.getByTestId("bike-data-pages-gravel"));

    await waitFor(() => expect(screen.getByTestId("layout-editor")).toBeTruthy());
  });

  /** 링크를 공유하거나 새로고침해도 같은 자전거의 편집기가 열려야 한다. */
  it("URL 만으로 그 자전거의 편집기가 열린다", async () => {
    renderPane("/settings/equipment?profileId=gravel&panel=data-pages");

    await waitFor(() => expect(screen.getByTestId("layout-editor")).toBeTruthy());
    expect(screen.getByText(/그래블/)).toBeTruthy();
  });

  /** 임시 표시본 위에서는 저장을 막는다 — 보존해야 할 원문을 정상 데이터로 덮어쓴다. */
  it("읽지 못한 레코드면 저장을 막고 이유를 말한다", async () => {
    mocks.layoutState = { ...mocks.layoutState, source: "quarantined", canSave: false };

    renderPane("/settings/equipment?profileId=road&panel=data-pages");

    await waitFor(() => expect(screen.getByTestId("layout-editor").dataset.readonly).toBe("true"));
    expect(screen.getByTestId("bike-data-pages-status").textContent).toBeTruthy();
  });

  it("돌아가기는 목록으로 되돌린다", async () => {
    renderPane("/settings/equipment?profileId=road&panel=data-pages");

    await userEvent.click(screen.getByTestId("bike-data-pages-back"));

    await waitFor(() => expect(screen.queryByTestId("layout-editor")).toBeNull());
  });
});
