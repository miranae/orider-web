import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PublicActivityPhotos from "./PublicActivityPhotos";
import type { createPublicActivityClient } from "../../services/publicActivityDetail";
const client = { photos: vi.fn() };
const revoke = vi.fn();
const photo = (id: string) => ({ id, url: `https://example.com/${id}.jpg`, caption: id });
function view() { return render(<PublicActivityPhotos activityId="ride" initialPhotos={[photo("first")]} truncated client={client as unknown as ReturnType<typeof createPublicActivityClient>} onAccessRevoked={revoke} />); }
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
it("loads the native gallery only after an explicit request", async () => {
  client.photos.mockResolvedValue({ photos: [photo("first"), photo("second")], truncated: false });
  view();
  expect(client.photos).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "추가 사진" }));
  expect(await screen.findByAltText("second")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "추가 사진" })).not.toBeInTheDocument();
});
it("preserves existing previews after a transient error", async () => {
  client.photos.mockRejectedValue(new Error("offline")); view();
  fireEvent.click(screen.getByRole("button", { name: "추가 사진" }));
  await screen.findByRole("alert");
  expect(screen.getByAltText("first")).toBeInTheDocument();
});
it("revokes the parent view after access changes", async () => {
  client.photos.mockRejectedValue({ code: "functions/permission-denied" }); view();
  fireEvent.click(screen.getByRole("button", { name: "추가 사진" }));
  await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
});
