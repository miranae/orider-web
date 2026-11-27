import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FtpDevicesCard } from "./FtpDevicesCard";

const mocks = vi.hoisted(() => ({ list: vi.fn(), retire: vi.fn(), confirm: vi.fn(), services: {} }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../../services/ftpDeviceRegistrations", () => ({ listActiveFtpDevices: mocks.list, retireFtpRegistration: mocks.retire }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([{ id: "old", platform: "android", lastSeenAt: 1000 }]);
});

it("요청할 때만 목록을 읽고 사용자가 확인한 기기만 해제한다", async () => {
  render(<FtpDevicesCard uid="owner" names={new Map([["old", "이전 태블릿"]])} />);
  expect(mocks.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "등록 기기 보기" }));
  expect(await screen.findByText("이전 태블릿")).toBeInTheDocument();
  mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "등록 해제" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "등록 해제" })).toBeEnabled());
  expect(mocks.retire).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "등록 해제" }));
  await screen.findByText("등록된 FTP 동기화 기기가 없습니다.");
  expect(mocks.retire).toHaveBeenCalledWith(mocks.services, "owner", "old");
});

it("서버 해제가 실패하면 기기가 남아 재시도할 수 있다", async () => {
  mocks.confirm.mockResolvedValue(true);
  mocks.retire.mockRejectedValue(new Error("offline"));
  render(<FtpDevicesCard uid="owner" names={new Map()} />);
  fireEvent.click(screen.getByRole("button", { name: "등록 기기 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: "등록 해제" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "등록 해제" })).toBeEnabled();
});
