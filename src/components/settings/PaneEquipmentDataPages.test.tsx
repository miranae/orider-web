import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profiles: [] as Array<Record<string, unknown>>,
  save: vi.fn(),
  layoutState: {} as Record<string, unknown>,
  toasts: [] as string[],
  toastCalls: [] as unknown[][],
  reload: vi.fn(),
  weightKg: 70 as number | undefined,
  saveFromEditor: null as null | (() => Promise<void>),
}));

vi.mock("../../hooks/useMaintenanceSnapshot", () => ({ useMaintenanceSnapshot: () => ({ envelope: null, display: null }) }));
vi.mock("../../hooks/useRunHistory", () => ({ useRunHistory: () => ({ runs: [], loading: false, available: true }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
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
  useAuth: () => ({ user: { uid: "uid-a" }, profile: { weightKg: mocks.weightKg } }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: (m: string, ...rest: unknown[]) => { mocks.toasts.push(m); mocks.toastCalls.push([m, ...rest]); } }),
}));
vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));
vi.mock("./LayoutEditorCard", () => ({
  LayoutEditorCard: ({ readOnly, config, onSave }: { readOnly?: boolean; config: unknown; onSave: (c: unknown) => Promise<void> }) => {
    mocks.saveFromEditor = () => onSave(config);
    return <div data-testid="layout-editor" data-readonly={String(Boolean(readOnly))} />;
  },
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
      <PaneEquipment part="device" />
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
    mocks.toastCalls.length = 0;
    mocks.reload.mockReset();
    mocks.weightKg = 70;
    mocks.layoutState = {
      config: { pages: [{ columns: 4, rows: 4, fields: [] }] },
      source: "canonical",
      revision: 3,
      loading: false,
      canSave: true,
      save: mocks.save,
      reload: mocks.reload,
    };
  });

  it("프로필 장비에는 작동값 편집과 데이터 페이지가 없고 기기 링크를 보여준다", () => {
    render(<MemoryRouter><PaneEquipment /></MemoryRouter>);
    expect(screen.queryByTestId("bike-data-pages-road")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href")?.includes("/settings/device"))).toBe(true);
  });

  it("기기 자전거에는 이름 편집과 삭제를 숨기고 프로필 장비에 보존한다", () => {
    const device = renderPane();
    expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
    device.unmount();
    render(<MemoryRouter><PaneEquipment part="gear" /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: "이름 변경" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "삭제" }).length).toBeGreaterThan(0);
  });

  it("many bike profiles keep the active preview small and all profiles reachable on expansion", async () => {
    mocks.profiles = Array.from({ length: 24 }, (_, index) => ({
      ...profile(`bike-${index}`, `Bike ${index}`), updatedAt: index,
    }));
    render(<MemoryRouter><PaneEquipment part="gear" /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: "이름 변경" })).toHaveLength(3);
    const preview = screen.getAllByTestId("P4-1-1").filter((element) => element.tagName === "DIV");
    expect(preview).toHaveLength(3);
    expect(preview[0]).toHaveTextContent("Bike 0");
    expect(preview[1]).toHaveTextContent("Bike 23");
    const summary = screen.getByRole("button", { name: "다른 자전거 프로필 21개" });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("P4-1-1").filter((element) => element.tagName === "DIV")).toHaveLength(24);
    expect(screen.getAllByRole("button", { name: "이름 변경" })).toHaveLength(24);
    await userEvent.click(summary);
    expect(screen.getAllByRole("button", { name: "이름 변경" })).toHaveLength(3);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("자전거 행에서 데이터 페이지를 연다", async () => {
    renderPane();

    await userEvent.click(screen.getAllByRole("combobox")[0]!);
    await userEvent.click(screen.getByRole("option", { name: "그래블" }));
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

  /** 경고·알림 → 해결: 원격을 읽지 못한 문구 자체를 누르면 다시 불러온다. 새 버튼은 만들지 않는다. */
  it("구성을 불러오지 못한 문구를 누르면 다시 불러온다", async () => {
    mocks.layoutState = { ...mocks.layoutState, source: "unavailable", canSave: false };
    renderPane("/settings/equipment?profileId=road&panel=data-pages");

    const message = await screen.findByRole("button", { name: /저장된 구성을 지금 불러오지 못했어요/ });
    // 돌아가기 + 실패 문구 — 그 밖의 버튼은 없다.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    await userEvent.click(message);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("읽지 못한 레코드(격리) 문구는 다시 읽어도 해소되지 않으므로 누를 수 없다", async () => {
    mocks.layoutState = { ...mocks.layoutState, source: "quarantined", canSave: false };
    renderPane("/settings/equipment?profileId=road&panel=data-pages");

    await waitFor(() => expect(screen.getByTestId("bike-data-pages-status").textContent).toBeTruthy());
    expect(screen.queryByRole("button", { name: /저장된 구성을 읽지 못했어요/ })).toBeNull();
  });

  it("저장하려던 자전거가 삭제됐다는 알림을 누르면 자전거 목록(기기 설정)으로 간다", async () => {
    mocks.save.mockResolvedValueOnce({ status: "targetDeleted" });
    renderPane("/settings/equipment?profileId=road&panel=data-pages");
    await waitFor(() => expect(screen.getByTestId("layout-editor")).toBeTruthy());
    await mocks.saveFromEditor?.();
    await waitFor(() => expect(mocks.toastCalls).toContainEqual(["저장하려던 자전거가 삭제됐어요.", "error", { resolve: { to: "/settings/device" } }]));
  });

  it("체중이 없으면 설명 안의 「미설정」을 누르면 체중 칸으로 간다", async () => {
    mocks.weightKg = undefined;
    renderPane();
    const link = await screen.findByRole("link", { name: "미설정" });
    expect(link.getAttribute("href")).toMatch(/\/settings\/account\?focus=weight$/);
    // 설명 문장은 그대로 남는다.
    expect(screen.getByText(/라이더 체중은 신체 정보의 몸무게/)).toBeTruthy();
  });

  it("체중이 있으면 설명에 누를 곳이 없다", () => {
    renderPane();
    expect(screen.queryByRole("link", { name: /kg/ })).toBeNull();
  });
});
