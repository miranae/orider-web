import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCallableImplementation } from "../__tests__/mocks/firebase";
import { useCreatorRecipeEmail } from "./useCreatorRecipeEmail";

const user = { uid: "test-uid" };
const actions = { emailed: "SENT", emailLogin: "LOGIN", emailFailed: "FAILED", emailQuotaExceeded: "EMAIL_QUOTA", emailCooldown: "EMAIL_COOLDOWN" };
const showToast = vi.fn();
const signIn = vi.fn();
function Harness({ language = "en" }: { language?: string }) {
  const { handleEmailRecipe } = useCreatorRecipeEmail({ user, language, actions, showToast, signIn });
  return <button onClick={() => void handleEmailRecipe("weekly-load")}>Send</button>;
}
it.each(["ko", "en"])("does not mislabel a recipe read limit as email quota in %s", async language => {
  setCallableImplementation("sendCreatorRecipeEmail", () => { throw Object.assign(new Error("PRIVATE_TOKEN"), { code: "functions/resource-exhausted", details: { reason: "recipe-read-minute-limit", retryAt: Date.now() + 60_000 } }); });
  renderWithProviders(<Harness language={language} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(showToast).toHaveBeenCalled());
  expect(showToast.mock.lastCall?.[0]).toContain(language === "ko" ? "레시피 조회" : "recipe reads");
  expect(showToast.mock.lastCall?.[0]).not.toContain("EMAIL_QUOTA");
  expect(showToast.mock.lastCall?.[0]).not.toContain("PRIVATE_TOKEN");
});
it("keeps known email quota feedback while treating unknown resource exhaustion as a safe generic failure", async () => {
  setCallableImplementation("sendCreatorRecipeEmail", () => { throw Object.assign(new Error("PRIVATE_TOKEN"), { code: "functions/resource-exhausted", details: { reason: "unknown-internal-limit" } }); });
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith("FAILED", "error"));
});
it("preserves the specific confirmed email daily-limit message", async () => {
  setCallableImplementation("sendCreatorRecipeEmail", () => { throw Object.assign(new Error("PRIVATE_TOKEN"), { code: "functions/resource-exhausted", details: { reason: "daily-limit" } }); });
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith("EMAIL_QUOTA", "error"));
});
