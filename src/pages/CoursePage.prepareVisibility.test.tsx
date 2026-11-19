import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { encodePolyline } from "../utils/polyline";
vi.mock("firebase/auth", () => ({
  getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
  onAuthStateChanged: (_auth: unknown, callback: () => void) => { callback(); return () => {}; },
}));
vi.mock("../features/courses/courseDetailAsset", async () => {
  const { doc, onSnapshot } = await import("firebase/firestore");
  return { subscribeCourseDetail: (services: { firestore: Parameters<typeof doc>[0] }, id: string, onData: (value: unknown) => void, onError: (error: Error) => void) =>
    onSnapshot(doc(services.firestore, "courses", id), (snapshot) => onData(snapshot.exists() ? { id, ...snapshot.data() } : null), onError) };
});
// 계정 전환 테스트용 — 렌더마다 새 객체를 주면 user 를 의존하는 효과가 매번 다시 돈다. uid 별로 같은 값을 준다.
const authState = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const signIn = () => {};
  return { uid: "owner", value(uid: string) {
    if (!values.has(uid)) values.set(uid, { user: { uid }, profile: { weightKg: 70, ftp: 250, isAdmin: uid === "admin" }, loading: false, profileLoading: false, signIn });
    return values.get(uid);
  } };
});
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => authState.value(authState.uid) }));
import { setDocData, mockDocData, setCallableImplementation, simulateLogin } from "../__tests__/mocks/firebase";
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useParams: () => ({ courseId: "course-climb", lang: "ko" }) }));
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [], loading: false }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null, status: "ready" }) }));
vi.mock("../hooks/useCourseAnalysis", () => ({ useCourseAnalysis: () => ({ envelope: null }), courseAnalysisNoteKey: vi.fn() }));
vi.mock("./LabPage", () => ({ default: () => <div>Preparation calculator</div> }));
vi.mock("../features/courses/CourseRidePlanSection", () => ({ CourseRidePlanSection: () => null }));
vi.mock("@shared/sim/climbPrediction", () => ({ predictClimb: () => ({ totalSec: 744, sustainablePowerW: 280, wattsPerKg: 4.12, source: "pdc" }), formatClimbDuration: () => "12:24" }));
vi.mock("../components/RouteMap", () => ({
  default: ({ markerPosition }: { markerPosition?: [number, number] | null }) =>
    markerPosition ? <output data-testid="course-map-marker">{JSON.stringify(markerPosition)}</output> : null,
}));
vi.mock("../features/courses/CourseStageProfile", () => ({
  CourseStageProfile: ({ onHoverIndex }: { onHoverIndex: (index: number) => void }) =>
    <button onMouseEnter={() => onHoverIndex(1)}>Hover midpoint</button>,
}));
import CoursePage from "./CoursePage";
import { ToastProvider } from "../contexts/ToastContext";
import { DialogProvider } from "../contexts/DialogContext";
import i18n from "i18next";
import enCourse from "../i18n/resources/en/course.json";
import enGlossary from "../i18n/resources/en/termGlossary.json";
describe("course preparation climb predictions", () => {
  beforeEach(() => { void i18n.changeLanguage("ko"); authState.uid = "owner"; simulateLogin({ uid: "owner" }); });
  beforeEach(() => setDocData("courses/course-climb", {
    name: "Climbing course", description: "", creatorId: "other", creatorNickname: "Creator", source: "orider",
    polyline: "", distance: 10000, elevationGain: 400, averageGrade: 4, maximumGrade: 8,
    regions: [], tags: [], climbs: [{ cat: 3, dist: 3000, gain: 200 }], photos: [],
    createdAt: 1, likeCount: 0, viewCount: 0,
  }));
  it("keeps an elevation hover over the dateline aligned with the mapped course", async () => {
    const coursePath = "courses/course-climb";
    setDocData(coursePath, {
      ...mockDocData.get(coursePath),
      polyline: encodePolyline([[0, 179], [0, -179]]),
      elevationProfile: [{ d: 0, e: 0 }, { d: 5000, e: 30 }, { d: 10000, e: 40 }],
    });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    fireEvent.mouseEnter(await screen.findByRole("button", { name: "Hover midpoint" }));
    expect(screen.getByTestId("course-map-marker")).toHaveTextContent("[0,180]");
  });

  it("keeps likes distinct from the actual share action even when the count is zero", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    expect(screen.getByRole("button", { name: "좋아요 0" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: "공유" })).toHaveLength(1);
  });
  it("renders simulator, GPX, share and report as icon-only actions while like and send-to-app keep text", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    for (const name of ["시뮬레이터", "GPX", "공유", "신고"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("ds-btn--icon-only");
      expect(button).toHaveAttribute("title", name);
      expect(button).toHaveTextContent("");
    }
    expect(screen.getByRole("button", { name: "좋아요 0" })).not.toHaveClass("ds-btn--icon-only");
    expect(screen.getByRole("button", { name: /앱으로 보내기/ })).not.toHaveClass("ds-btn--icon-only");
  });
  it("renders owner delete and admin hide/unhide as icon-only actions, delete still asking first", async () => {
    authState.uid = "admin"; simulateLogin({ uid: "admin" });
    let deletes = 0;
    setCallableImplementation("deleteMyCourse", () => { deletes += 1; return { data: {} }; });
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), creatorId: "admin" });
    const view = render(<DialogProvider><MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter></DialogProvider>);
    await screen.findByText("Climbing course");
    for (const name of ["삭제", "숨기기"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("ds-btn--icon-only");
      expect(button).toHaveAttribute("title", name);
      expect(button).toHaveTextContent("");
    }
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("정말 이 코스를 삭제하시겠습니까?")).toBeInTheDocument();
    expect(deletes).toBe(0);
    view.unmount();
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), hidden: true });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    const unhide = screen.getByTestId("O2-1");
    expect(unhide).toHaveAccessibleName("숨김 해제");
    expect(unhide).toHaveAttribute("title", "숨김 해제");
    expect(unhide).toHaveClass("ds-btn--icon-only");
  });
  it("lays out actions as send-to-app first, one icon row in a fixed order, then view count sharing a row with management icons", async () => {
    authState.uid = "admin"; simulateLogin({ uid: "admin" });
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), creatorId: "admin" });
    render(<DialogProvider><MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter></DialogProvider>);
    await screen.findByText("Climbing course");
    const actions = screen.getByTestId("course-actions");
    const names = within(actions).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(names).toEqual(["앱으로 보내기", "좋아요 0", "시뮬레이터", "GPX", "공유", "신고", "삭제", "숨기기"]);
    // 주 동작은 칸 전체 폭, 보조 아이콘은 한 줄 묶음
    expect(screen.getByRole("button", { name: /앱으로 보내기/ })).toHaveClass("ds-btn--block");
    const icons = screen.getByTestId("course-action-icons");
    for (const name of ["좋아요 0", "시뮬레이터", "GPX", "공유"]) expect(icons).toContainElement(screen.getByRole("button", { name }));
    // 신고·관리 아이콘은 혼자 한 줄을 차지하지 않고 조회수와 같은 줄에 있다(좁은 칸에서 신고만 줄바꿈되던 문제)
    const footer = screen.getByTestId("course-action-footer");
    expect(footer).toContainElement(screen.getByTestId("course-view-count"));
    for (const name of ["신고", "삭제", "숨기기"]) expect(footer).toContainElement(screen.getByRole("button", { name }));
    expect(icons).not.toContainElement(screen.getByRole("button", { name: "신고" }));
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
  it("opens owner editing from the pencil next to the course title", async () => {
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), creatorId: "owner" });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    const pencil = screen.getByRole("button", { name: "편집" });
    // 연필은 제목과 같은 줄에 있고, 통계 줄에는 삭제만 남는다.
    expect(pencil.parentElement).toContainElement(screen.getByTestId("D2-0"));
    expect(screen.getAllByRole("button", { name: "편집" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    fireEvent.click(pencil);
    expect(screen.getByLabelText("코스 이름")).toHaveValue("Climbing course");
    expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
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
  it("puts focus back on the name field once the name-length alert is confirmed", async () => {
    setDocData("courses/course-climb", { ...mockDocData.get("courses/course-climb"), creatorId: "owner" });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("tab", { name: "편집" }));
    const name = screen.getByLabelText("코스 이름");
    fireEvent.change(name, { target: { value: "A" } });
    // 편집을 열 때의 자동 초점(50ms)이 지난 뒤 저장 버튼에 초점이 있는 상태에서 시작한다.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
    screen.getByRole("button", { name: "저장" }).focus();
    expect(document.activeElement).not.toBe(name);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(document.activeElement).toBe(name));
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

  it("opens device settings from the no-device send failure message itself", async () => {
    setCallableImplementation("sendCourseToApp", () => Promise.reject({ code: "functions/failed-precondition", message: "연결된 앱 기기가 없습니다. 모바일 앱에 로그인해 주세요." }));
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><ToastProvider><CoursePage /></ToastProvider></MemoryRouter>);
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("button", { name: /앱으로 보내기/ }));
    expect(await screen.findByRole("link", { name: "연결된 앱 기기가 없습니다. 모바일 앱에 로그인해 주세요." })).toHaveAttribute("href", "/ko/settings/device");
    expect(screen.queryByRole("link", { name: "기기 설정" })).toBeNull();
  });
  it("sends again from an unexpected send failure message itself", async () => {
    let calls = 0;
    setCallableImplementation("sendCourseToApp", () => { calls += 1; return Promise.reject({ code: "functions/unavailable" }); });
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><ToastProvider><CoursePage /></ToastProvider></MemoryRouter>);
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("button", { name: /앱으로 보내기/ }));
    fireEvent.click(await screen.findByRole("button", { name: "전송에 실패했습니다" }));
    await waitFor(() => expect(calls).toBe(2));
  });
  it("does not resend from a failure message after the account changed", async () => {
    let calls = 0;
    setCallableImplementation("sendCourseToApp", () => { calls += 1; return Promise.reject({ code: "functions/unavailable" }); });
    const tree = () => <MemoryRouter initialEntries={["/ko/course/course-climb"]}><ToastProvider><CoursePage /></ToastProvider></MemoryRouter>;
    const { rerender } = render(tree());
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("button", { name: /앱으로 보내기/ }));
    const message = await screen.findByRole("button", { name: "전송에 실패했습니다" });
    authState.uid = "someone-else";
    simulateLogin({ uid: "someone-else" });
    rerender(tree());
    fireEvent.click(message);
    await act(async () => { await Promise.resolve(); });
    expect(calls).toBe(1);
  });
  it("drops a late send failure that arrives after the account changed", async () => {
    let reject: (error: unknown) => void = () => {};
    setCallableImplementation("sendCourseToApp", () => new Promise((_resolve, fail) => { reject = fail; }));
    const tree = () => <MemoryRouter initialEntries={["/ko/course/course-climb"]}><ToastProvider><CoursePage /></ToastProvider></MemoryRouter>;
    const { rerender } = render(tree());
    await screen.findByText("Climbing course");
    fireEvent.click(screen.getByRole("button", { name: /앱으로 보내기/ }));
    authState.uid = "someone-else";
    simulateLogin({ uid: "someone-else" });
    rerender(tree());
    await act(async () => { reject({ code: "functions/unavailable" }); await Promise.resolve(); });
    expect(screen.queryByText("전송에 실패했습니다")).toBeNull();
  });

});
