import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import StravaSummaryPublishing, { parseStravaSummaryTarget } from "./StravaSummaryPublishing";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), prepare: vi.fn(), publish: vi.fn(), status: vi.fn(), connect: vi.fn(), ready: vi.fn(), local: false, log: vi.fn(), functions: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => name === "stravaSummaryPublishStatus" ? mocks.status : name === "stravaPrepareSummaryPreview" ? mocks.prepare : mocks.publish }));
vi.mock("../../services/stravaSummaryPreview", () => ({ requestStravaSummaryPreview: mocks.preview, isLocalStravaSummaryPreview: () => mocks.local }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ functions: mocks.functions, ensureAppCheckReady: mocks.ready }) }));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava: mocks.connect }) }));

const canonicalBlock = "[O-Rider Summary]\n서버에서 준비한 요약\n\n체력 변화 +1";
const readyPreview = (overrides: Record<string, unknown> = {}) => ({ status: "ready", activityId: "own-ride", stravaActivityId: "12345", lang: "ko", shareText: "not reconstructed by the client", summaryBlock: canonicalBlock, previewDigest: "reviewed-v1", version: 1, generatedAt: 1, targetVerified: true, publishStatus: { status: "unavailable" }, ...overrides });
async function renderReady(lang: "ko" | "en" = "ko") {
  render(<StravaSummaryPublishing activityId="own-ride" lang={lang} />);
  return screen.findByLabelText("stravaSummary.previewLabel");
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.local = false;
  resetRuntimeConfigForTests({ stravaSummaryPreviewEnabled: true });
  mocks.ready.mockResolvedValue(undefined);
  mocks.preview.mockResolvedValue({ data: readyPreview() });
  mocks.prepare.mockResolvedValue({ data: readyPreview() });
  mocks.publish.mockResolvedValue({ data: { status: "published", stravaActivityId: "12345" } });
  mocks.status.mockResolvedValue({ data: { status: "unavailable" } });
});
afterEach(() => { vi.useRealTimers(); resetRuntimeConfigForTests(); });

describe("Strava summary publishing", () => {
  it("defaults to the existing publisher without preview, prepare, or mount-time status calls", async () => {
    resetRuntimeConfigForTests();
    render(<StravaSummaryPublishing activityId="own-ride" lang="en" />);
    expect(screen.queryByLabelText("stravaSummary.previewLabel")).not.toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    const publish = screen.getByText("stravaSummary.legacy.publish").closest<HTMLButtonElement>("button")!;
    expect(publish).toHaveRole("button");
    expect(publish).toHaveAccessibleName("stravaSummary.legacy.publish");
    expect(publish).toBeVisible();
    await act(async () => { fireEvent.click(publish); });
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ activityId: "own-ride", lang: "en" }));
    expect(screen.getByText("stravaSummary.view", { selector: "a" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    expect(screen.getByText("stravaSummary.view", { selector: "a" })).toHaveRole("link");
    expect(screen.getByText("stravaSummary.view", { selector: "a" })).toHaveAccessibleName("stravaSummary.view");
    expect(screen.getByText("stravaSummary.view", { selector: "a" })).toBeVisible();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("preserves queued legacy status polling without invoking the preview API", async () => {
    vi.useFakeTimers();
    resetRuntimeConfigForTests({ stravaSummaryPreviewEnabled: false });
    mocks.publish.mockResolvedValue({ data: { status: "queued", stravaActivityId: "12345" } });
    mocks.status.mockResolvedValue({ data: { status: "published", stravaActivityId: "12345" } });
    await act(async () => { render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stravaSummary.legacy.publish" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(mocks.status).toHaveBeenCalledWith({ activityId: "own-ride", stravaActivityId: "12345" });
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toBeInTheDocument();
  });

  it("keeps the approved local read-only adapter available with the remote feature disabled", async () => {
    resetRuntimeConfigForTests({ stravaSummaryPreviewEnabled: false });
    mocks.local = true;
    expect((await renderReady()).textContent).toBe(canonicalBlock);
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
  });

  it("automatically reads the exact canonical block and target without preparing or publishing", async () => {
    const text = await renderReady();
    expect(text.textContent).toBe(canonicalBlock);
    expect(mocks.preview).toHaveBeenCalledWith(mocks.functions, { activityId: "own-ride", lang: "ko" });
    expect(screen.getByRole("link", { name: "stravaSummary.targetActivity" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("stravaSummary.targetHelp").closest("details")).not.toHaveAttribute("open");
  });

  it("pairs preview and result headings while keeping target editing separate from publishing", async () => {
    mocks.preview.mockResolvedValue({ data: readyPreview({ publishStatus: { status: "published", stravaActivityId: "12345" } }) });
    const preview = await renderReady();
    const previewHeading = screen.getByRole("heading", { name: "stravaSummary.previewLabel", level: 4 });
    const resultHeading = screen.getByRole("heading", { name: "stravaSummary.statusTitle", level: 4 });
    expect(previewHeading.parentElement).toContainElement(preview);
    expect(resultHeading.parentElement).toContainElement(screen.getByRole("button", { name: "stravaSummary.publish" }));
    const targetEditor = screen.getByText("stravaSummary.targetHelp").closest("details");
    expect(previewHeading.parentElement).not.toContainElement(targetEditor);
    expect(resultHeading.parentElement).not.toContainElement(targetEditor);
  });

  it("does not label a preview failure as a previous publication result", async () => {
    mocks.preview.mockRejectedValue(new Error("offline"));
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.previewError");
    expect(screen.queryByRole("heading", { name: "stravaSummary.lastResult" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "stravaSummary.statusTitle", level: 4 })).toBeInTheDocument();
  });

  it.each([false, true])("shows an external scroll hint only when the canonical preview overflows (overflow=%s)", async overflow => {
    const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return this.tagName === "PRE" ? overflow ? 1000 : 100 : 0; } });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.tagName === "PRE" ? overflow ? 384 : 100 : 0; } });
    try {
      const pre = await renderReady();
      expect(pre.textContent).toBe(canonicalBlock);
      const hint = overflow ? await screen.findByText("stravaSummary.scrollPreview") : screen.queryByText("stravaSummary.scrollPreview");
      if (overflow) { expect(hint).toBeInTheDocument(); expect(pre).not.toContainElement(hint); }
      else expect(hint).not.toBeInTheDocument();
    } finally {
      if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      if (client) Object.defineProperty(HTMLElement.prototype, "clientHeight", client); else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    }
  });

  it("publishes only the reviewed target and digest after the explicit action", async () => {
    await renderReady("en");
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ activityId: "own-ride", lang: "en", stravaActivityId: "12345", expectedPreviewDigest: "reviewed-v1" }));
    expect(await screen.findByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    expect(screen.getByText("stravaSummary.lastResult")).toBeInTheDocument();
  });

  it.each(["published", "unchanged", "queued", "reauthorization-required", "unavailable"] as const)("shows an explicit %s publishing result", async status => {
    mocks.publish.mockResolvedValue({ data: { status, stravaActivityId: "12345" } });
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    expect(await screen.findByText(`stravaSummary.resultTitle.${status === "unavailable" ? "statusUnavailable" : status}`)).toBeInTheDocument();
    expect(screen.getByText(`stravaSummary.${status === "unavailable" ? "statusUnavailable" : status}`)).toBeInTheDocument();
    if (status === "reauthorization-required") {
      fireEvent.click(screen.getByRole("button", { name: "stravaSummary.reconnect" }));
      expect(mocks.connect).toHaveBeenCalledWith(window.location.pathname, { writeActivities: true });
    }
  });

  it("polls a queued result without issuing another publishing request", async () => {
    vi.useFakeTimers();
    mocks.publish.mockResolvedValue({ data: { status: "queued", stravaActivityId: "12345" } });
    mocks.status.mockResolvedValue({ data: { status: "published", stravaActivityId: "12345" } });
    await act(async () => { render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" })); });
    expect(screen.getByText("stravaSummary.queued")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("stravaSummary.published")).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledWith({ activityId: "own-ride", stravaActivityId: "12345" });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("invalidates a changed preview and requires a fresh review before another publish", async () => {
    mocks.publish.mockResolvedValueOnce({ data: { status: "unavailable", reason: "preview-changed" } });
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.previewChanged");
    expect(screen.queryByRole("button", { name: "stravaSummary.publish" })).not.toBeInTheDocument();
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ previewDigest: "reviewed-v2", summaryBlock: "[O-Rider Summary]\n새 요약" }) });
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.retryPreview" }));
    expect(await screen.findByLabelText("stravaSummary.previewLabel")).toHaveTextContent("새 요약");
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("opens manual targeting only when needed and reads a new preview before publishing", async () => {
    mocks.preview.mockResolvedValueOnce({ data: { status: "unavailable", reason: "mapping-required" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await screen.findByText("stravaSummary.mappingRequired");
    expect(screen.getByText("stravaSummary.targetHelp").closest("details")).toHaveAttribute("open");
    const field = screen.getByLabelText("stravaSummary.targetLabel");
    fireEvent.change(field, { target: { value: "https://www.strava.com/activities/98765" } });
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ stravaActivityId: "98765" }) });
    fireEvent.submit(field.closest("form")!);
    await screen.findByLabelText("stravaSummary.previewLabel");
    expect(mocks.preview).toHaveBeenLastCalledWith(mocks.functions, { activityId: "own-ride", lang: "ko", stravaActivityId: "98765" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("clears a reviewed preview as soon as the manual target changes and rejects invalid links", async () => {
    await renderReady();
    const field = screen.getByLabelText("stravaSummary.targetLabel");
    fireEvent.change(field, { target: { value: "https://strava.com.evil/activities/123" } });
    expect(screen.queryByLabelText("stravaSummary.previewLabel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "stravaSummary.publish" })).not.toBeInTheDocument();
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.invalidTarget");
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("prepares a missing summary only after an explicit owner action", async () => {
    mocks.preview.mockResolvedValueOnce({ data: { status: "unavailable", reason: "summary-not-ready" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    const prepare = await screen.findByRole("button", { name: "stravaSummary.prepare" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    fireEvent.click(prepare);
    expect(await screen.findByLabelText("stravaSummary.previewLabel")).toHaveTextContent("서버에서 준비한 요약");
    expect(mocks.prepare).toHaveBeenCalledWith({ activityId: "own-ride", lang: "ko" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each(["metrics-not-ready", "activity-record-receipt-pending", "inputs-changed"])("explains %s without offering premature generation", async reason => {
    mocks.preview.mockResolvedValueOnce({ data: { status: "unavailable", reason } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await screen.findByRole("button", { name: "stravaSummary.retryPreview" });
    expect(screen.queryByRole("button", { name: "stravaSummary.prepare" })).not.toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("shows the last publishing request even when the current summary is unavailable", async () => {
    mocks.preview.mockResolvedValueOnce({ data: { status: "unavailable", reason: "summary-not-ready", stravaActivityId: "12345" } });
    mocks.status.mockResolvedValueOnce({ data: { status: "published", stravaActivityId: "12345" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    expect(await screen.findByText("stravaSummary.lastResult")).toBeInTheDocument();
    expect(screen.getByText("stravaSummary.summaryNotReady")).toBeInTheDocument();
    expect(screen.getByText("stravaSummary.published")).toBeInTheDocument();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("fails closed on preview errors and shows publishing errors explicitly", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("unavailable"));
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.previewError");
    expect(screen.queryByRole("button", { name: "stravaSummary.publish" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.retryPreview" }));
    await screen.findByLabelText("stravaSummary.previewLabel");
    mocks.publish.mockRejectedValueOnce(new Error("unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.publishUnconfirmed");
  });

  it("blocks publishing and preparing in local preview mode", async () => {
    mocks.local = true;
    await renderReady();
    const publish = screen.getByRole("button", { name: "stravaSummary.publish" });
    expect(publish).toBeDisabled(); fireEvent.click(publish);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toHaveTextContent("stravaSummary.localPreviewOnly");
  });

  it("also blocks explicit summary preparation in local preview mode", async () => {
    mocks.local = true;
    mocks.preview.mockResolvedValueOnce({ data: { status: "unavailable", reason: "summary-not-ready" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    const prepare = await screen.findByRole("button", { name: "stravaSummary.prepare" });
    expect(prepare).toBeDisabled(); fireEvent.click(prepare);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("preserves the last request target and result while reviewing a different manual target", async () => {
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ publishStatus: { status: "published", stravaActivityId: "12345" } }) });
    await renderReady();
    const field = screen.getByLabelText("stravaSummary.targetLabel");
    fireEvent.change(field, { target: { value: "98765" } });
    expect(screen.getByText("stravaSummary.published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ stravaActivityId: "98765" }) });
    fireEvent.submit(field.closest("form")!);
    await screen.findByLabelText("stravaSummary.previewLabel");
    expect(screen.getByRole("link", { name: "stravaSummary.targetActivity" })).toHaveAttribute("href", "https://www.strava.com/activities/98765");
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/98765");
  });

  it("switches the status snapshot on explicit target apply and blocks an already queued target", async () => {
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ publishStatus: { status: "published", stravaActivityId: "12345" } }) });
    await renderReady();
    const field = screen.getByLabelText("stravaSummary.targetLabel");
    fireEvent.change(field, { target: { value: "98765" } });
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    vi.useFakeTimers();
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ stravaActivityId: "98765", publishStatus: { status: "queued", stravaActivityId: "98765" } }) });
    await act(async () => { fireEvent.submit(field.closest("form")!); });
    expect(screen.getByText("stravaSummary.queued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
    expect(field).toBeDisabled();
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/98765");
    mocks.status.mockResolvedValueOnce({ data: { status: "published", stravaActivityId: "98765" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(mocks.status).toHaveBeenCalledWith({ activityId: "own-ride", stravaActivityId: "98765" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("locks target apply while a manual status response is pending so late A cannot overwrite B", async () => {
    let complete!: (value: unknown) => void;
    mocks.status.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    await renderReady();
    const field = screen.getByLabelText("stravaSummary.targetLabel");
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.refreshStatus" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(field).toBeDisabled();
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "98765" } });
    fireEvent.submit(field.closest("form")!);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    await act(async () => { complete({ data: { status: "queued", stravaActivityId: "12345" } }); });
    expect(screen.getByText("stravaSummary.queued")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("logs only a safe error code and never the outgoing text or backend message", async () => {
    mocks.preview.mockRejectedValueOnce(Object.assign(new Error(`private payload ${canonicalBlock}`), { code: "functions/unavailable" }));
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await screen.findByRole("alert");
    expect(mocks.log).toHaveBeenCalledWith("StravaSummaryPublishing.preview", expect.objectContaining({ message: "functions/unavailable" }), { activityId: "own-ride" });
    expect(String(mocks.log.mock.calls[0]?.[1])).not.toContain(canonicalBlock);
  });

  it("keeps an unknown network result bound to the submitted target and checks status without republishing", async () => {
    await renderReady();
    mocks.publish.mockRejectedValueOnce(new Error("network response lost"));
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("stravaSummary.publishUnconfirmed");
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
    expect(screen.getByLabelText("stravaSummary.targetLabel")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.refreshStatus" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledWith({ activityId: "own-ride", stravaActivityId: "12345" }));
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
    mocks.status.mockResolvedValueOnce({ data: { status: "published", stravaActivityId: "12345", phase: "final" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "stravaSummary.refreshStatus" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.refreshStatus" }));
    await screen.findByText("stravaSummary.published");
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeEnabled();
  });

  it("labels a provisional publication as interim rather than final completion", async () => {
    mocks.preview.mockResolvedValueOnce({ data: readyPreview({ publishStatus: { status: "published", stravaActivityId: "12345", phase: "provisional" } }) });
    await renderReady();
    expect(screen.getByText("stravaSummary.provisionalPublished")).toBeInTheDocument();
    expect(screen.queryByText("stravaSummary.published")).not.toBeInTheDocument();
  });

  it("blocks target edits and duplicate publishes while queued and offers manual checking after the polling cap", async () => {
    vi.useFakeTimers();
    mocks.publish.mockResolvedValue({ data: { status: "queued", stravaActivityId: "12345" } });
    mocks.status.mockResolvedValue({ data: { status: "queued", stravaActivityId: "12345" } });
    await act(async () => { render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" })); });
    expect(screen.getByLabelText("stravaSummary.targetLabel")).toBeDisabled();
    expect(screen.getByRole("button", { name: "stravaSummary.publish" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000 * 121); });
    expect(mocks.status).toHaveBeenCalledTimes(120);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stravaSummary.refreshStatus" })); });
    expect(mocks.status).toHaveBeenCalledTimes(121);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("discards a late publish result after changing accounts", async () => {
    let complete!: (result: unknown) => void;
    mocks.publish.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const { rerender } = render(<StravaSummaryPublishing key="owner" activityId="own-ride" lang="ko" />);
    await screen.findByLabelText("stravaSummary.previewLabel");
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalled());
    rerender(<StravaSummaryPublishing key="other" activityId="other-ride" lang="ko" />);
    await act(async () => { complete({ data: { status: "published", stravaActivityId: "12345" } }); });
    expect(screen.queryByText("stravaSummary.published")).not.toBeInTheDocument();
  });

  it("rejects lookalike hosts, invalid IDs and non-HTTPS activity links", () => {
    expect(parseStravaSummaryTarget("https://www.strava.com/activities/123?foo=bar")).toBe("123");
    for (const value of ["https://strava.com.evil/activities/123", "http://strava.com/activities/123", "0", "9007199254740993", "abc"]) expect(parseStravaSummaryTarget(value)).toBeNull();
  });
});
