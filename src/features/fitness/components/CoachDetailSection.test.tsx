import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import CoachDetailSection from "./CoachDetailSection";
function View({ requested = false }: { requested?: boolean }) {
  const location = useLocation();
  return <><output data-testid="location">{location.search}{location.hash}</output><CoachDetailSection id="ftp-decision" title="FTP 상세" requested={requested}><input aria-label="선택 메모" defaultValue="" /><button>마지막 도구</button></CoachDetailSection><CoachDetailSection id="analysis-model" title="모델 상세"><p>별도 범주</p></CoachDetailSection></>;
}
describe("mobile coach detail navigation", () => {
  it("opens a single stable detail surface, preserves query and selected state, and restores trigger focus on back", async () => {
    renderWithProviders(<View />, { route: "/ko/coach/analysis?sport=bike&range=90" });
    const trigger = screen.getByRole("button", { name: /FTP 상세/ });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "FTP 상세" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByTestId("location")).toHaveTextContent("sport=bike&range=90&detail=ftp-decision");
    fireEvent.change(within(dialog).getByLabelText("선택 메모"), { target: { value: "선택 유지" } });
    const back = within(dialog).getByRole("button", { name: /뒤로/ });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByText("마지막 도구")).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId("location")).toHaveTextContent("?sport=bike&range=90");
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "FTP 상세" })).toBeVisible();
    expect(screen.getByLabelText("선택 메모")).toHaveValue("선택 유지");
  });
  it.each(["?sport=bike&detail=ftp-decision", "?sport=bike#ftp-decision"])("supports direct entry / reload at %s without leaving on close", async suffix => {
    renderWithProviders(<View />, { route: `/ko/coach/analysis${suffix}` });
    fireEvent.click(within(screen.getByRole("dialog", { name: "FTP 상세" })).getByRole("button", { name: /뒤로/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("sport=bike&detail=closed");
    await waitFor(() => expect(screen.getByRole("button", { name: /FTP 상세/ })).toHaveFocus());
  });
  it("does not reopen a requested decision after explicitly closing and retains its identifier", async () => {
    renderWithProviders(<View requested />, { route: "/ko/coach/analysis?sport=bike&decisionId=decision-1" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("decisionId=decision-1&detail=closed");
  });
});
