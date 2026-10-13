import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { getDoc } from "firebase/firestore";
import i18n from "i18next";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setDocData, simulateLogin } from "../../__tests__/mocks/firebase";
import { resetRuntimeConfigForTests, type RuntimeConfig } from "../../services/runtimeConfig";
import EventRegisterPage from "./EventRegisterPage";
import CreatorHubPage, { creatorApiDocsLinks } from "../CreatorHubPage";

vi.mock("../../hooks/useActivities", () => ({ useWeeklyStats: () => ({ weeklyStats: [] }) }));
const originalRead = vi.mocked(getDoc).getMockImplementation()!;
const info = { name: "Context fixture", status: "OPEN", type: "TOUR", feeType: "FREE", categories: [],
  startTime: Date.now() + 86_400_000, closeAt: new Date(Date.now() + 43_200_000).toISOString() };
const snapshot = (value: Record<string, unknown> | null) => ({ exists: () => value !== null, data: () => value,
  metadata: { fromCache: false, hasPendingWrites: false } });
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function RoutesWithNavigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/ko/event/other/register")}>Other event</button>
    <Routes><Route path="/ko/event/:eventId/register" element={<EventRegisterPage />} /></Routes></>;
}
function registration() {
  return renderWithProviders(<RoutesWithNavigation />, { authenticated: true, route: "/ko/event/ev/register" });
}
function delayedSelf() {
  const pending = deferred();
  let requested = false;
  vi.mocked(getDoc).mockImplementation((...args) => {
    if ((args[0] as unknown as { path: string }).path === "events/ev/participants/test-uid" && !requested) {
      requested = true;
      return pending.promise as never;
    }
    return originalRead(...args);
  });
  return { pending, requested: () => requested };
}
const foreignParticipant = { registrationNumber: "FOREIGN-OLD-NUMBER", realName: "Foreign old profile",
  emergencyContact: { name: "Foreign emergency", relation: "Foreign relation", phone: "000" } };

describe("self participant read context admission", () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockImplementation(originalRead);
    setDocData("events/ev", { info });
    setDocData("events/other", { info: { ...info, name: "Other fixture" } });
  });
  afterEach(async () => { await act(async () => { await i18n.changeLanguage("ko"); }); });

  it("admits the unchanged UID/event request", async () => {
    const self = delayedSelf();
    registration();
    await waitFor(() => expect(self.requested()).toBe(true));
    await act(async () => { self.pending.resolve(snapshot(foreignParticipant)); });
    expect(await screen.findByText("FOREIGN-OLD-NUMBER")).toBeInTheDocument();
  });

  it("rejects a deferred old UID result after account change without carrying a number or private profile", async () => {
    const self = delayedSelf();
    registration();
    await waitFor(() => expect(self.requested()).toBe(true));
    await act(async () => { simulateLogin({ uid: "other-uid" }); });
    await screen.findByPlaceholderText("홍길동");
    await act(async () => { self.pending.resolve(snapshot(foreignParticipant)); });
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Foreign old profile")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Foreign emergency")).not.toBeInTheDocument();
  });

  it("rejects an ABA auth transition even when React ends on the same UID", async () => {
    const self = delayedSelf();
    registration();
    await waitFor(() => expect(self.requested()).toBe(true));
    await act(async () => { simulateLogin({ uid: "other-uid" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => { self.pending.resolve(snapshot(foreignParticipant)); });
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Foreign old profile")).not.toBeInTheDocument();
  });

  it("rejects the old event result after route change", async () => {
    const self = delayedSelf();
    registration();
    await waitFor(() => expect(self.requested()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Other event" }));
    await screen.findAllByText("Other fixture");
    await act(async () => { self.pending.resolve(snapshot(foreignParticipant)); });
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Foreign old profile")).not.toBeInTheDocument();
  });

  it("does not apply a self result after unmount", async () => {
    const self = delayedSelf();
    const view = registration();
    await waitFor(() => expect(self.requested()).toBe(true));
    view.unmount();
    await act(async () => { self.pending.resolve(snapshot(foreignParticipant)); });
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
  });

  it("clears an already completed registration when a new UID has no participant document", async () => {
    setDocData("events/ev/participants/test-uid", foreignParticipant);
    registration();
    await screen.findByText("FOREIGN-OLD-NUMBER");
    await act(async () => { simulateLogin({ uid: "other-uid" }); });
    expect(await screen.findByPlaceholderText("홍길동")).toHaveValue("");
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
  });

  it("clears a previous event's completion on a new event with no self registration", async () => {
    setDocData("events/ev/participants/test-uid", foreignParticipant);
    registration();
    await screen.findByText("FOREIGN-OLD-NUMBER");
    fireEvent.click(screen.getByRole("button", { name: "Other event" }));
    expect(await screen.findByPlaceholderText("홍길동")).toHaveValue("");
    expect(screen.queryByText("FOREIGN-OLD-NUMBER")).not.toBeInTheDocument();
  });

  it("preserves the manually entered form on locale change", async () => {
    registration();
    fireEvent.change(await screen.findByPlaceholderText("홍길동"), { target: { value: "Typed by current user" } });
    await act(async () => { await i18n.changeLanguage("en"); });
    expect(await screen.findByDisplayValue("Typed by current user")).toBeInTheDocument();
  });
});

const stage: RuntimeConfig = { appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1",
  firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com", firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app",
  firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841",
  firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
  personalApiBase: "https://qapersonalapi-ldfyfyx5da-du.a.run.app",
  aiApiBase: "https://orider-ai-api-qa-firstpass-ldfyfyx5da-du.a.run.app",
  stravaRedirectUri: "https://orider-dev.web.app", segmentTilesBase: "https://orider-dev.web.app", heatmapBase: "https://orider-dev.web.app" };

describe("Creator Hub API documentation destinations", () => {
  afterEach(async () => { resetRuntimeConfigForTests(); await act(async () => { await i18n.changeLanguage("ko"); }); });

  it("uses the reviewed stage personal API base and preserves empty-base relative URLs", () => {
    expect(creatorApiDocsLinks(stage)).toEqual({ docs: `${stage.personalApiBase}/api/v1/docs`,
      openapi: `${stage.personalApiBase}/api/v1/docs/openapi.yaml` });
    expect(creatorApiDocsLinks({})).toEqual({ docs: "/api/v1/docs", openapi: "/api/v1/docs/openapi.yaml" });
    expect(creatorApiDocsLinks({ personalApiBase: "https://api.example/" }).docs).toBe("https://api.example/api/v1/docs");
  });
  it.each(["/", "http://unsafe.example", "javascript:alert(1)", "https://user:pass@api.example", "https://api.example?token=x", "https://api.example#fragment"])("fails closed for unsafe docs base %s", personalApiBase => {
    expect(() => creatorApiDocsLinks({ personalApiBase })).toThrow();
  });
  it("keeps the existing stage isolation guard for production or unreviewed origins", () => {
    for (const personalApiBase of ["https://orider.co.kr", "https://unreviewed.example"]) {
      expect(() => creatorApiDocsLinks({ ...stage, personalApiBase })).toThrow("stage/service-origin-mismatch");
    }
  });
  it.each(["ko", "en"])("renders the same source-bound docs destinations in %s", async lang => {
    resetRuntimeConfigForTests(stage);
    await act(async () => { await i18n.changeLanguage(lang); });
    renderWithProviders(<Routes><Route path="/:lang/creator/:section" element={<CreatorHubPage />} /></Routes>, { route: `/${lang}/creator/recipes` });
    const links = creatorApiDocsLinks(stage);
    expect(screen.getByRole("link", { name: lang === "ko" ? "Swagger UI 열기" : "Open Swagger UI" })).toHaveAttribute("href", links.docs);
    expect(screen.getByRole("link", { name: lang === "ko" ? "OpenAPI YAML 보기" : "View OpenAPI YAML" })).toHaveAttribute("href", links.openapi);
  });
});
