import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDocData } from "../__tests__/mocks/firebase";
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { weightKg: 70, ftp: 200 } }) }));
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [] }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
import LabPage from "./LabPage";
describe("course preparation calculator", () => {
  beforeEach(() => {
    setDocData("courses/current", { name: "Current course", distance: 1000, elevationGain: 10, elevationProfile: [{ d: 0, e: 0 }, { d: 1000, e: 10 }] });
    setDocData("courses/other", { name: "Other course", distance: 2000, elevationGain: 20, elevationProfile: [{ d: 0, e: 0 }, { d: 2000, e: 20 }] });
  });
  it("uses the detail course over an unrelated query and locks its selector", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/current?courseId=other"]}><LabPage presetCourseId="current" embedded /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveValue("current"));
    expect(screen.getAllByRole("combobox")[0]).toBeDisabled();
    expect(screen.queryByRole("option", { name: "Other course" })).toBeNull();
  });
  it("preserves the standalone lab query and editable selector", async () => {
    render(<MemoryRouter initialEntries={["/ko/lab?courseId=other"]}><LabPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveValue("other"));
    expect(screen.getAllByRole("combobox")[0]).not.toBeDisabled();
  });
});
