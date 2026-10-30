import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation } from "../../__tests__/mocks/firebase";
import ActivityMapThumbnailResetControl from "./ActivityMapThumbnailResetControl";

const resets = () => mockCallableInvocations.filter(({ name }) => name === "resetActivityMapThumbnail");

it("asks for confirmation before clearing the map thumbnail", async () => {
  setCallableImplementation("resetActivityMapThumbnail", () => ({ data: { activityId: "a", reset: true } }));
  renderWithProviders(<ActivityMapThumbnailResetControl activityId="a" />, { authenticated: true, user: { uid: "owner" } });
  const before = resets().length;
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 지우기" }));
  expect(resets()).toHaveLength(before);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 지우기" }));
  await waitFor(() => expect(resets()).toHaveLength(before + 1));
  expect(resets().at(-1)?.data).toEqual({ activityId: "a" });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("지웠습니다"));
  expect(screen.queryByRole("button", { name: "지도 썸네일 지우기" })).not.toBeInTheDocument();
});

it("reports a failure without hiding the button", async () => {
  setCallableImplementation("resetActivityMapThumbnail", () => { throw Object.assign(new Error("denied"), { code: "functions/permission-denied" }); });
  renderWithProviders(<ActivityMapThumbnailResetControl activityId="a" />, { authenticated: true, user: { uid: "owner" } });
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 지우기" }));
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 지우기" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("지우지 못했습니다"));
  expect(screen.getByRole("button", { name: "지도 썸네일 지우기" })).toBeInTheDocument();
});
