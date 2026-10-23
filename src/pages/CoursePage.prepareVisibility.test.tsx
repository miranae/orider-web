import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
vi.mock("firebase/auth", () => ({ getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { weightKg: 70, ftp: 250 }, loading: false, profileLoading: false, signIn: vi.fn() }) }));
import { setDocData, mockDocData, setCallableImplementation } from "../__tests__/mocks/firebase";
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useParams: () => ({ courseId: "course-climb", lang: "ko" }) }));
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [], loading: false }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null, status: "ready" }) }));
vi.mock("../hooks/useCourseAnalysis", () => ({ useCourseAnalysis: () => ({ envelope: null }), courseAnalysisNoteKey: vi.fn() }));
vi.mock("./LabPage", () => ({ default: () => <div>Preparation calculator</div> }));
vi.mock("../features/courses/CourseRidePlanSection", () => ({ CourseRidePlanSection: () => null }));
vi.mock("@shared/sim/climbPrediction", () => ({ predictClimb: () => ({ totalSec: 744, sustainablePowerW: 280, wattsPerKg: 4.12, source: "pdc" }), formatClimbDuration: () => "12:24" }));
import CoursePage from "./CoursePage";
import i18n from "i18next";
import enCourse from "../i18n/resources/en/course.json";
import enGlossary from "../i18n/resources/en/termGlossary.json";
describe("course preparation climb predictions", () => {
  beforeEach(() => { void i18n.changeLanguage("ko"); });
  beforeEach(() => setDocData("courses/course-climb", {
    name: "Climbing course", description: "", creatorId: "other", creatorNickname: "Creator", source: "orider",
    polyline: "", distance: 10000, elevationGain: 400, averageGrade: 4, maximumGrade: 8,
    regions: [], tags: [], climbs: [{ cat: 3, dist: 3000, gain: 200 }], photos: [],
    createdAt: 1, likeCount: 0, viewCount: 0,
  }));
  it("keeps likes distinct from the actual share action even when the count is zero", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    expect(screen.getByRole("button", { name: "좋아요 0" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: "공유" })).toHaveLength(1);
  });
  it("keeps report choices above the dialog and changes a reason without submitting", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    const opener = screen.getByRole("button", { name: "신고" });
    opener.focus(); fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "코스 신고" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(dialog.closest('.fixed')?.parentElement).toBe(document.body);
    const reason = within(dialog).getByRole("combobox", { name: "신고 사유" });
    reason.focus(); fireEvent.click(reason);
    fireEvent.keyDown(reason, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(reason);
    const list = screen.getByRole("listbox", { name: "신고 사유" });
    expect(Number(list.style.zIndex)).toBeGreaterThan(Number(dialog.style.zIndex));
    fireEvent.click(within(list).getByRole("option", { name: "정보 부정확" }));
    expect(reason).toHaveTextContent("정보 부정확");
    expect(reason).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
  it("keeps a mocked pending report open until it resolves and restores its opener", async () => {
    let finish!: (result: { data: {} }) => void;
    setCallableImplementation("reportCourse", () => new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    const opener = screen.getByRole("button", { name: "신고" });
    opener.focus(); fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "코스 신고" });
    fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "true"));
    expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    act(() => { finish({ data: {} }); });
    // DOM removal can precede the modal's passive focus/scroll cleanup.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(document.body.style.position).not.toBe("fixed");
      expect(document.body.style.overflow).not.toBe("hidden");
    });
  });
  it("associates owner edit labels with the existing form controls", async () => {
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), creatorId: "owner" });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("tab", { name: "편집" }));
    expect(screen.getByLabelText("코스 이름")).toHaveValue("Climbing course");
    expect(screen.getByLabelText("설명 (선택)")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
    expect(screen.getByRole("tab", { name: "편집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
  });
  it("shows climb-time estimates in a visible preparation subtree, retaining overview badges", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    expect(screen.queryByTestId("D2-2")).toBeNull();
    expect(screen.getByText("200m / 3.0km")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "준비" }));
    const preparation = await screen.findByTestId("D2-2");
    await waitFor(() => expect(within(preparation).getByText(/12:24/)).toBeVisible());
    expect(preparation.closest(".course-col")).toBeNull();
    expect(screen.queryByRole("button", { name: "시뮬레이터" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "개요·지형" }));
    expect(screen.queryByTestId("D2-2")).toBeNull();
    expect(screen.getByText("200m / 3.0km")).toBeVisible();
  });
  it.each(["ko", "en"])("explains preparation FTP and maximum gradient in %s without nesting buttons", async (language) => {
    i18n.addResourceBundle("en", "course", enCourse);
    i18n.addResourceBundle("en", "termGlossary", enGlossary);
    await i18n.changeLanguage(language);
    render(<MemoryRouter initialEntries={[`/${language}/course/course-climb?tab=prepare`]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    const maxGrade = screen.getByRole("button", { name: language === "ko" ? "최대경사" : "Max. Grade" });
    fireEvent.click(maxGrade);
    expect(screen.getByRole("tooltip")).toHaveTextContent("100");
    fireEvent.mouseLeave(maxGrade);
    const preparation = await screen.findByTestId("D2-2");
    const ftp = await within(preparation).findByRole("button", { name: /FTP/ });
    fireEvent.click(ftp);
    expect(screen.getAllByRole("tooltip").some(tip => tip.textContent?.includes(language === "ko" ? "기능적 역치 파워" : "Functional threshold power"))).toBe(true);
    expect(preparation.querySelector("button button")).toBeNull();
    expect(within(preparation).getByRole("button", { name: language === "ko" ? /파워 지속곡선/ : /power-duration curve/ })).toBeInTheDocument();
  });

});
