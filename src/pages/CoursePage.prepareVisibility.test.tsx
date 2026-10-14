import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
vi.mock("firebase/auth", () => ({ getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { weightKg: 70, ftp: 250 }, loading: false, profileLoading: false, signInWithGoogle: vi.fn() }) }));
import { setDocData } from "../__tests__/mocks/firebase";
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useParams: () => ({ courseId: "course-climb", lang: "ko" }) }));
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [], loading: false }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null, status: "ready" }) }));
vi.mock("../hooks/useCourseAnalysis", () => ({ useCourseAnalysis: () => ({ envelope: null }), courseAnalysisNoteKey: vi.fn() }));
vi.mock("./LabPage", () => ({ default: () => <div>Preparation calculator</div> }));
vi.mock("../features/courses/CourseRidePlanSection", () => ({ CourseRidePlanSection: () => null }));
vi.mock("@shared/sim/climbPrediction", () => ({ predictClimb: () => ({ totalSec: 744, sustainablePowerW: 280, wattsPerKg: 4.12, source: "pdc" }), formatClimbDuration: () => "12:24" }));
import CoursePage from "./CoursePage";
describe("course preparation climb predictions", () => {
  beforeEach(() => setDocData("courses/course-climb", {
    name: "Climbing course", description: "", creatorId: "other", creatorNickname: "Creator", source: "orider",
    polyline: "", distance: 10000, elevationGain: 400, averageGrade: 4, maximumGrade: 8,
    regions: [], tags: [], climbs: [{ cat: 3, dist: 3000, gain: 200 }], photos: [],
    createdAt: 1, likeCount: 0, viewCount: 0,
  }));
  it("shows climb-time estimates in a visible preparation subtree, retaining overview badges", async () => {
    render(<MemoryRouter initialEntries={["/ko/course/course-climb"]}><CoursePage /></MemoryRouter>);
    await screen.findByText("Climbing course");
    expect(screen.queryByTestId("D2-2")).toBeNull();
    expect(screen.getByText("200m / 3.0km")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "준비" }));
    const preparation = await screen.findByTestId("D2-2");
    await waitFor(() => expect(within(preparation).getByText(/12:24/)).toBeVisible());
    expect(preparation.closest(".course-col")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "개요·지형" }));
    expect(screen.queryByTestId("D2-2")).toBeNull();
    expect(screen.getByText("200m / 3.0km")).toBeVisible();
  });
});
