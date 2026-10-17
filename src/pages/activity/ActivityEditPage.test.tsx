import i18n from "i18next";
import enActivity from "../../i18n/resources/en/activity.json";
import enGlossary from "../../i18n/resources/en/termGlossary.json";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockUpdateDoc, setDocData } from "../../__tests__/mocks/firebase";
import ActivityEditPage from "./ActivityEditPage";

vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useParams: () => ({ activityId: "edit-gear" }),
}));

const originalGear = { name: "Road bike", type: "bike", totalDistanceKm: 1234, maxDistanceKm: 5000, provider: { id: "provider-gear" } };
function show(gear: unknown, locale = "ko") {
  setDocData("activities/edit-gear", {
    userId: "test-uid", type: "Ride", name: "Morning Ride", description: "Morning Ride",
    visibility: "everyone", startTime: Date.UTC(2026, 9, 11, 0), gear, gearId: "canonical-provider-id",
  });
  return renderWithProviders(<ActivityEditPage />, { authenticated: true, route: `/${locale}/activity/edit-gear/edit` });
}

beforeEach(() => { mockUpdateDoc.mockClear(); });

describe("activity equipment editing", () => {
  it.each(["ko", "en"])("explains RPE without selecting or saving an exertion value in %s", async language => {
    i18n.addResourceBundle("en", "activity", enActivity, true, true);
    i18n.addResourceBundle("en", "termGlossary", enGlossary, true, true);
    await i18n.changeLanguage(language);
    try {
      const user = userEvent.setup();
      show(originalGear, language);
      expect(await screen.findByRole("textbox", { name: language === "en" ? enActivity.edit.fieldName : "활동 이름" })).toHaveValue("Morning Ride");
      const term = await screen.findByRole("button", { name: language === "en" ? "About RPE" : "RPE 설명" });
      await user.click(term);
      const tooltip = await screen.findByRole("tooltip");
      expect(term.isConnected).toBe(true);
      expect(screen.getByRole("button", { name: language === "en" ? "About RPE" : "RPE 설명" })).toBe(term);
      expect(term).toHaveAttribute("aria-describedby", tooltip.id);
      expect(screen.getByRole("button", { name: "7", exact: true })).toHaveAttribute("aria-pressed", "false");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    } finally { await i18n.changeLanguage("ko"); }
  });

  it("displays the canonical object name and preserves all equipment fields when unchanged", async () => {
    show(originalGear);
    expect(await screen.findByRole("textbox", { name: "사용한 자전거" })).toHaveValue("Road bike");
    fireEvent.change(screen.getByRole("textbox", { name: "활동 이름" }), { target: { value: "Renamed ride" } });
    fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledOnce());
    const update = mockUpdateDoc.mock.calls[0][1];
    expect(update).toMatchObject({ name: "Renamed ride" });
    expect(update).not.toHaveProperty("gear");
    expect(update).not.toHaveProperty("gear.name");
    expect(update).not.toHaveProperty("gearId");
  });

  it("renames only the canonical gear name using a field path, retaining metadata and provider identity", async () => {
    show(originalGear);
    const input = await screen.findByRole("textbox", { name: "사용한 자전거" });
    fireEvent.change(input, { target: { value: "  New bike name  " } });
    fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledOnce());
    const update = mockUpdateDoc.mock.calls[0][1];
    expect(update["gear.name"]).toBe("New bike name");
    expect(update).not.toHaveProperty("gear");
    expect(update).not.toHaveProperty("gearId");
    expect(originalGear).toEqual({ name: "Road bike", type: "bike", totalDistanceKm: 1234, maxDistanceKm: 5000, provider: { id: "provider-gear" } });
  });

  it("supports keyboard radio selection and opens a labeled date picker without changing equipment", async () => {
    show(originalGear);
    await screen.findByRole("textbox", { name: "사용한 자전거" });
    const workouts = within(screen.getByRole("radiogroup", { name: "운동 유형" })).getAllByRole("radio");
    workouts[0]!.focus();
    fireEvent.keyDown(workouts[0]!, { key: "ArrowRight" });
    expect(workouts[1]).toHaveFocus();
    expect(workouts[1]).toHaveAttribute("aria-checked", "true");
    expect(workouts[0]).toHaveAttribute("tabindex", "-1");
    const visibility = within(screen.getByRole("radiogroup", { name: "공개 범위" })).getAllByRole("radio");
    fireEvent.keyDown(visibility[0]!, { key: "End" });
    expect(visibility[2]).toHaveFocus();
    expect(visibility[2]).toHaveAttribute("aria-checked", "true");
    const date = screen.getByRole("button", { name: "날짜" });
    expect(date.querySelector("svg")).not.toBeNull();
    fireEvent.click(date);
    expect(date).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves legacy string compatibility, rename=%s", async rename => {
    show("Legacy bike");
    const input = await screen.findByRole("textbox", { name: "사용한 자전거" });
    expect(input).toHaveValue("Legacy bike");
    if (rename) fireEvent.change(input, { target: { value: " Legacy renamed " } });
    fireEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledOnce());
    const update = mockUpdateDoc.mock.calls[0][1];
    if (rename) expect(update.gear).toBe("Legacy renamed");
    else expect(update).not.toHaveProperty("gear");
    expect(update).not.toHaveProperty("gear.name");
    expect(update).not.toHaveProperty("gearId");
  });
});
