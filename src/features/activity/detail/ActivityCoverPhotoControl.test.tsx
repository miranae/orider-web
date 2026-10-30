import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { ActivityCoverPhotoControl } from "./ActivityCoverPhotoControl";
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../../services/nativeActivityPhoto", () => ({ loadNativeActivityCover: api.load, setNativeActivityCover: api.save }));
beforeEach(() => { vi.clearAllMocks(); api.load.mockResolvedValue({ photoId: null, coverRevision: "r0" }); });
it("selects and clears the current photo using the acknowledged revision", async () => {
  api.save.mockResolvedValueOnce({ photoId: "p2", coverRevision: "r1" }).mockResolvedValueOnce({ photoId: null, coverRevision: "r2" });
  renderWithProviders(<ActivityCoverPhotoControl activityId="ride" photoId="p2" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대표사진으로 선택" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대표사진으로 선택" }));
  expect(await screen.findByText("현재 대표사진")).toBeInTheDocument();
  expect(api.save).toHaveBeenLastCalledWith(expect.anything(), "ride", "p2", "r0");
  fireEvent.click(screen.getByRole("button", { name: "대표사진 선택 해제" }));
  await waitFor(() => expect(screen.queryByText("현재 대표사진")).not.toBeInTheDocument());
  expect(api.save).toHaveBeenLastCalledWith(expect.anything(), "ride", null, "r1");
});
it("does not overwrite after a conflict or network failure and reloads before retry", async () => {
  api.save.mockRejectedValueOnce({ code: "functions/aborted" });
  renderWithProviders(<ActivityCoverPhotoControl activityId="ride" photoId="p2" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대표사진으로 선택" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대표사진으로 선택" }));
  await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "대표사진으로 선택" })).toBeDisabled();
  api.load.mockResolvedValue({ photoId: "p1", coverRevision: "newer" });
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "대표사진으로 선택" })).toBeEnabled());
  api.save.mockResolvedValue({ photoId: "p2", coverRevision: "r3" });
  fireEvent.click(screen.getByRole("button", { name: "대표사진으로 선택" }));
  await screen.findByText("현재 대표사진"); expect(api.save).toHaveBeenLastCalledWith(expect.anything(), "ride", "p2", "newer");
});
it("ignores pending selection after an account-keyed remount", async () => {
  let resolve!: (v: unknown) => void; api.save.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = renderWithProviders(<ActivityCoverPhotoControl key="owner" activityId="ride" photoId="p2" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "대표사진으로 선택" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "대표사진으로 선택" }));
  view.rerender(<ActivityCoverPhotoControl key="next" activityId="ride" photoId="p2" />);
  await act(async () => resolve({ photoId: "p2", coverRevision: "old" }));
  expect(screen.queryByText("현재 대표사진")).not.toBeInTheDocument();
});
