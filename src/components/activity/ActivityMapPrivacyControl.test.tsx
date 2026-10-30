import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActivityMapPrivacyControl from "./ActivityMapPrivacyControl";
const m = vi.hoisted(() => ({ user: { uid: "owner" }, services: {}, load: vi.fn(), preview: vi.fn(), save: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => m.services }));
vi.mock("../../services/activityMapPrivacy", () => ({ createActivityMapPrivacyClient: () => ({ load: m.load, preview: m.preview, save: m.save }) }));
vi.mock("./ActivityMapThumbnailResetControl", () => ({ default: () => <button>지도 썸네일 지우기</button> }));
vi.mock("../RouteMap", () => ({ default: ({ polyline }: { polyline: string }) => <div data-testid="safe-map">{polyline}</div> }));
const current = { activityId: "a", revision: "r1", revocationPending: false, visibility: "everyone", settings: { startMeters: 0, endMeters: 0 }, mapPreview: { encodedPolyline: "current", imageUrl: null }, state: "available", policy: "endpoint_radius_longest_safe_section_v1" };
beforeEach(() => { vi.clearAllMocks(); m.user = { uid: "owner" }; m.load.mockResolvedValue(current); m.preview.mockResolvedValue({ ...current, mapPreview: { encodedPolyline: "preview", imageUrl: null } }); m.save.mockResolvedValue({ ...current, revision: "r2", settings: { startMeters: 250, endMeters: 0 } }); });
const open = async () => { fireEvent.click(screen.getByRole("button", { name: "공개 지도 보호 설정" })); await screen.findByLabelText("시작 지점 보호 반경 (m)"); };
it("requires preview of current draft before saving and distinguishes unsaved geometry", async () => {
 render(<ActivityMapPrivacyControl activityId="a" />); await open();
 expect(screen.getByRole("button", { name: "이 설정 저장" })).toBeDisabled();
 fireEvent.change(screen.getByLabelText("시작 지점 보호 반경 (m)"), { target: { value: "250" } }); fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" }));
 await screen.findByText(/저장 전 미리보기/); expect(screen.getByTestId("safe-map")).toHaveTextContent("preview"); expect(m.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "이 설정 저장" })); await screen.findByText("공개 지도 보호 설정을 저장했습니다."); expect(m.save).toHaveBeenCalledWith("a", { startMeters: 250, endMeters: 0 }, "r1");
});
it("invalidates preview when draft changes and clears maps on revision conflict", async () => {
 render(<ActivityMapPrivacyControl activityId="a" />); await open(); fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" })); await screen.findByText(/저장 전 미리보기/);
 fireEvent.change(screen.getByLabelText("종료 지점 보호 반경 (m)"), { target: { value: "300" } }); expect(screen.getByRole("button", { name: "이 설정 저장" })).toBeDisabled();
 m.preview.mockRejectedValue({ code: "functions/aborted" }); fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" })); await screen.findByRole("alert"); expect(screen.queryByTestId("safe-map")).toBeNull();
});
it("suppresses late old-account response even when UID is unchanged", async () => {
 let done!: (value: unknown) => void; m.load.mockImplementation(() => new Promise(resolve => { done = resolve; })); const view = render(<ActivityMapPrivacyControl activityId="a" />);
 fireEvent.click(screen.getByRole("button", { name: "공개 지도 보호 설정" })); m.user = { uid: "owner" }; view.rerender(<ActivityMapPrivacyControl activityId="a" />);
 await act(async () => done(current)); expect(screen.queryByTestId("safe-map")).toBeNull();
});
it("allows saving a protective setting that hides all geometry when GPS is unavailable", async () => {
 m.preview.mockResolvedValue({ ...current, state: "no_gps", mapPreview: { encodedPolyline: null, imageUrl: null } }); render(<ActivityMapPrivacyControl activityId="a" />); await open(); fireEvent.change(screen.getByLabelText("시작 지점 보호 반경 (m)"), { target: { value: "300" } }); fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" }));
 await waitFor(() => expect(screen.getByText(/경로 GPS가 없어/)).toBeInTheDocument()); expect(screen.getByRole("button", { name: "이 설정 저장" })).toBeEnabled();
 fireEvent.click(screen.getByRole("button", { name: "이 설정 저장" })); await waitFor(() => expect(m.save).toHaveBeenCalledWith("a", { startMeters: 300, endMeters: 0 }, "r1"));
});
it("cancel returns keyboard focus to the opening control", async () => {
 render(<ActivityMapPrivacyControl activityId="a" />); await open();
 await waitFor(() => expect(screen.getByLabelText("시작 지점 보호 반경 (m)")).toHaveFocus());
 fireEvent.click(screen.getByRole("button", { name: "취소" }));
 expect(screen.getByRole("button", { name: "공개 지도 보호 설정" })).toHaveFocus(); expect(screen.queryByTestId("safe-map")).toBeNull();
});
it("offers the thumbnail reset only when a published thumbnail exists", async () => {
 const { unmount } = render(<ActivityMapPrivacyControl activityId="a" />); await open();
 expect(screen.queryByRole("button", { name: "지도 썸네일 지우기" })).not.toBeInTheDocument(); unmount();
 m.load.mockResolvedValue({ ...current, mapPreview: { encodedPolyline: "current", imageUrl: "https://example.com/a.webp" } });
 render(<ActivityMapPrivacyControl activityId="a" />);
 expect(screen.queryByRole("button", { name: "지도 썸네일 지우기" })).not.toBeInTheDocument();
 await open(); expect(screen.getByRole("button", { name: "지도 썸네일 지우기" })).toBeInTheDocument();
});
