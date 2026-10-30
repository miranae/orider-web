import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AthletePhotoGallery, { athletePhotoIdentity } from "./AthletePhotoGallery";
import { simulateLogin } from "../../__tests__/mocks/firebase";
const load = vi.hoisted(() => vi.fn());
vi.mock("../../services/nativeActivityPhoto", async importOriginal => ({...await importOriginal<typeof import("../../services/nativeActivityPhoto")>(),loadNativeActivityPhoto:load}));
beforeEach(() => { load.mockReset().mockResolvedValue(new Blob(["photo"], {type:"image/webp"})); });
it("opens published photos, navigates with keys, and restores trigger focus on Escape", async () => {
  renderWithProviders(<AthletePhotoGallery photos={[{ id: "p1", url: "https://example.test/1.jpg", caption: "First", activityId: "a1" }, { id: "p2", url: "https://example.test/2.jpg", caption: "Second", activityId: "a2" }]} />);
  const trigger = screen.getAllByRole("button", { name: "활동 사진 보기" })[0]!;
  trigger.focus(); fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeInTheDocument();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByRole("link", { name: "활동 보기" })).toHaveAttribute("href", "/ko/activity/a2?tab=overview");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it("uses native activity/photo identities rather than collapsing empty URLs", () => {
  expect(athletePhotoIdentity({url:"",nativePhoto:{activityId:"a",photoId:"p1"}})).not.toBe(athletePhotoIdentity({url:"",nativePhoto:{activityId:"a",photoId:"p2"}}));
  expect(athletePhotoIdentity({url:"",nativePhoto:{activityId:"a",photoId:"p1"}})).not.toBe(athletePhotoIdentity({url:"",nativePhoto:{activityId:"b",photoId:"p1"}}));
  expect(athletePhotoIdentity({url:"https://example.test/photo"})).toBe("https://example.test/photo");
});
it("keeps native full-view failures retryable and removes old bytes on account changes", async () => {
  const create = vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:private-photo");
  const reference={activityId:"ride",photoId:"photo"};
  renderWithProviders(<AthletePhotoGallery photos={[{id:"photo",activityId:"ride",url:"",caption:"Native",nativePhoto:reference}]} />, {authenticated:true});
  await waitFor(() => expect(screen.getByRole("img",{name:"Native"})).toHaveAttribute("src","blob:private-photo"));
  load.mockRejectedValueOnce(new Error("network")); fireEvent.click(screen.getByRole("button",{name:"활동 사진 보기"}));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByRole("button",{name:"다시 시도"}));
  await waitFor(() => expect(within(dialog).getByRole("img",{name:"Native"})).toHaveAttribute("src","blob:private-photo"));
  load.mockRejectedValue(new Error("permission-denied"));
  act(() => simulateLogin({uid:"other",displayName:"Other",email:"other@example.test",photoURL:null}));
  await waitFor(() => expect(within(dialog).queryByRole("img",{name:"Native"})).toBeNull());
  expect(await within(dialog).findByRole("button",{name:"다시 시도"})).toBeEnabled();
  create.mockRestore();
});
it("never renders a legacy native download URL", () => {
  renderWithProviders(<AthletePhotoGallery photos={[{id:"old",activityId:"ride",url:"https://firebasestorage.googleapis.com/v0/b/bucket/o/activity_photos%2Fride%2Fold?token=old",caption:"Legacy"}]} />);
  expect(screen.queryByRole("img")).toBeNull(); expect(screen.queryByRole("button",{name:"활동 사진 보기"})).toBeNull();
});
