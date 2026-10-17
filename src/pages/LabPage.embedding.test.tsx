import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDocData } from "../__tests__/mocks/firebase";
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { weightKg: 70, ftp: 200 } }) }));
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [] }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
import { getDoc } from "firebase/firestore";
import LabPage from "./LabPage";
import i18n from "i18next";
import koLab from "../i18n/resources/ko/lab.json";
describe("course preparation calculator", () => {
  beforeEach(() => {
    i18n.addResourceBundle("ko", "lab", koLab);
    setDocData("courses/current", { name: "Current course", distance: 1000, elevationGain: 10, elevationProfile: [{ d: 0, e: 0 }, { d: 1000, e: 10 }] });
    setDocData("courses/other", { name: "Other course", distance: 2000, elevationGain: 20, elevationProfile: [{ d: 0, e: 0 }, { d: 2000, e: 20 }] });
  });
  it("associates embedded parameter names and hints with their exact inputs", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/current"]}><LabPage presetCourseId="current" embedded /></MemoryRouter>);
    await screen.findByText("예측 결과");
    fireEvent.click(screen.getByText("체중·장비와 계산 조건"));
    const controls = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const control of controls) {
      expect(control.id).not.toBe("");
      expect(control.labels?.length).toBe(1);
      expect(document.getElementById(control.getAttribute("aria-describedby")!)).toBeInTheDocument();
    }
    const rider = screen.getByRole("spinbutton", {name:koLab["params.riderKg"]});
    expect(rider).toHaveValue(70);
    for (const key of ["params.cda", "params.crr", "params.eta"] as const) {
      expect(screen.getByRole("spinbutton", { name: koLab[key] })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", {name:"목표시간 → 파워"}));
    const target = screen.getByRole("textbox", {name:"목표 시간 (h:mm:ss 또는 mm:ss)"}) as HTMLInputElement;
    expect(target.labels?.length).toBe(1);
    expect(document.getElementById(target.getAttribute("aria-describedby")!)).toBeInTheDocument();
  });

  it("uses the detail course without a duplicate page heading, selector or course statistics", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/current?courseId=other"]}><LabPage presetCourseId="current" embedded /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("예상시간")).toBeInTheDocument());
    expect(getDoc).toHaveBeenCalledWith(expect.objectContaining({ path: "courses/current" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText("코스 선택")).not.toBeInTheDocument();
    const parameters = screen.getByText("체중·장비와 계산 조건").closest("details");
    expect(parameters).not.toHaveAttribute("open");
    expect(screen.getByText("예측 결과")).toBeInTheDocument();
    expect(screen.queryByText("추정치이며 실제 기록을 보장하지 않습니다.")).toBeNull();
    expect(screen.getByText("베타 — 정확도 미보장")).toBeInTheDocument();
  });
  it("preserves the standalone lab query and editable selector", async () => {
    render(<MemoryRouter initialEntries={["/ko/lab?courseId=other"]}><LabPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveValue("other"));
    expect(screen.getAllByRole("combobox")[0]).not.toBeDisabled();
    expect(await screen.findByText("추정치이며 실제 기록을 보장하지 않습니다.")).toBeInTheDocument();
  });
});
