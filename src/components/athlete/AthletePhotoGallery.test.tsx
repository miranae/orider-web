import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AthletePhotoGallery from "./AthletePhotoGallery";
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
