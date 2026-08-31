import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import RiderWorkoutDeliveryPanel from "./RiderWorkoutDeliveryPanel";

const mocks = vi.hoisted(() => ({ controller: {} as Record<string, unknown>, submit: vi.fn(), prepare: vi.fn(), enabled: true }));
vi.mock("../useRiderWorkoutDelivery", () => ({ useRiderWorkoutDelivery: () => mocks.controller }));
vi.mock("../../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ riderWorkoutDeliveryEnabled: mocks.enabled }) }));

describe("RiderWorkoutDeliveryPanel", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
    mocks.prepare.mockReset();
    mocks.enabled = true;
    mocks.controller = {
      devices: [{ deviceId: "g1-recent", deviceName: "내 G1", appVersion: "2.0", lastSeenAtMillis: 20 }],
      devicesLoading: false, devicesError: null, targetDeviceId: "g1-recent", setTargetDeviceId: vi.fn(),
      delivery: null, deliveryState: null, submitState: "idle", submitError: null, submit: mocks.submit,
      submitErrorKind: null, restoreLoading: false, canCreate: true, canSafelyReplay: false, prepareNewRequest: mocks.prepare,
    };
  });

  it("shows a TSS preflight without inventing steps and requests the selected device", () => {
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="recovery" targetTss={20} />);
    expect(screen.getByText(/20 TSS 선택/)).toBeInTheDocument();
    expect(screen.queryByText("서버가 확정한 워크아웃")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 G1에 워크아웃 요청" }));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("calls pending queued rather than sent and renders only the authoritative bundle", () => {
    mocks.controller = {
      ...mocks.controller,
      deliveryState: "pending",
      delivery: { bundle: { ftpW: 250, targetTss: 20, steps: [
        { label: "WU", durationSec: 600, targetPowerMinW: 100, targetPowerMaxW: 125 },
        { label: "Z1", durationSec: 1800, targetPowerMinW: 125, targetPowerMaxW: 150 },
      ] } },
    };
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="recovery" targetTss={20} />);
    expect(screen.getByRole("status")).toHaveTextContent("요청 대기열에 등록됨");
    expect(screen.getByRole("status")).toHaveTextContent("아직 기기 수신은 확인되지 않았습니다");
    expect(screen.getByText((_text, element) => element?.textContent === "10분 · 100–125 W")).toBeInTheDocument();
  });

  it("offers replay only for an uncertain create failure", () => {
    mocks.controller = { ...mocks.controller, submitState: "error", submitError: new Error("network"), submitErrorKind: "uncertain_network", canSafelyReplay: true };
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="endurance" targetTss={45} />);
    fireEvent.click(screen.getByRole("button", { name: "같은 요청 다시 확인" }));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("explains deterministic FTP failures and requires an explicit new-request reset", () => {
    mocks.controller = { ...mocks.controller, submitState: "error", submitError: new Error("ftp"), submitErrorKind: "ftp_required", canSafelyReplay: false };
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="endurance" targetTss={45} />);
    expect(screen.getByRole("alert")).toHaveTextContent("유효한 FTP가 필요합니다");
    fireEvent.click(screen.getByRole("button", { name: "문제 해결 후 새 요청 준비" }));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("keeps the feature default-off surface honest", () => {
    mocks.enabled = false;
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="recovery" targetTss={20} />);
    expect(screen.getByText(/아직 기기로 요청하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["received", "G1 수신 확인"],
    ["deferred_in_ride", "현재 라이딩 종료 후 적용"],
    ["ready_for_next_ride", "다음 라이딩 준비 완료"],
    ["execution_started", "G1에서 운동 시작"],
    ["completed", "운동 완료"],
    ["failed", "G1 적용 실패"],
    ["superseded", "더 최신 워크아웃으로 대체됨"],
  ])("renders the %s receipt state without offering an unsafe retry", (state, label) => {
    mocks.controller = { ...mocks.controller, deliveryState: state };
    renderWithProviders(<RiderWorkoutDeliveryPanel uid="uid-1" workoutType="recovery" targetTss={20} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.queryByRole("button", { name: "같은 요청 다시 확인" })).not.toBeInTheDocument();
  });
});
