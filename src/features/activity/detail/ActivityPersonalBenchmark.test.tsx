import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";
import type { PdcDoc } from "@shared/types/pdc";
import parity from "../../coach/__fixtures__/rider-insight-parity.json";
import { ActivityPersonalBenchmark } from "./ActivityPersonalBenchmark";
const mocks = vi.hoisted(() => ({ uid: "owner", project: "a", callback: null as null | ((snap: any) => void), unsub: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: projects[mocks.project] }) }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => "pdc"), onSnapshot: vi.fn((_doc, callback) => { mocks.callback = callback; return mocks.unsub; }) }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
const projects: Record<string, object> = { a: { app: { name: "a", options: { projectId: "a" } } }, b: { app: { name: "b", options: { projectId: "b" } } } };
const reference = (): PdcDoc => ({ ...structuredClone(parity.persistedPdc), version: 6, status: "final", inputDigest: "a".repeat(64), asOf: 1791504000000,
  coverage: { state: "complete", candidateActivityCount: 12, includedActivityCount: 12, excludedActivityCount: 0,
    excludedActivityIds: [], excludedActivityIdsTruncated: false, excludedReasonCounts: {}, carriedForwardDurationCount: 0 } }) as PdcDoc;
const props = { activityId: "current", ownerUid: "owner", sport: "bike", metrics: { discipline: "bike" as const, isVirtualPower: false, inputCoverage: "complete" as const, mmp: { "1m": 350, "5m": 280 } } };
function open() { fireEvent.click(screen.getByRole("button", { name: "benchmark.title" })); }
beforeEach(() => { vi.clearAllMocks(); mocks.uid = "owner"; mocks.project = "a"; mocks.callback = null; });
describe("ActivityPersonalBenchmark", () => {
  it("adds no closed listener; one opened listener survives collapse and reopening", () => {
    render(<ActivityPersonalBenchmark {...props} />);
    expect(onSnapshot).not.toHaveBeenCalled();
    open(); expect(onSnapshot).toHaveBeenCalledTimes(1);
    act(() => mocks.callback?.({ exists: () => true, data: reference }));
    expect(screen.getByRole("combobox", { name: "benchmark.duration" })).toHaveValue("300");
    open(); open();
    expect(onSnapshot).toHaveBeenCalledTimes(1); expect(mocks.unsub).not.toHaveBeenCalled();
  });
  it("reuses a supplied canonical state without another listener", () => {
    render(<ActivityPersonalBenchmark {...props} suppliedPdcState={{ status: "ready", pdc: reference() }} />);
    open(); expect(onSnapshot).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "benchmark.chart" })).toBeInTheDocument();
  });
  it("supports duration selection by native control and graph, with exact reference source", () => {
    const pdc = reference();
    const r = render(<ActivityPersonalBenchmark {...props} suppliedPdcState={{ status: "ready", pdc }} />);
    open();
    expect(screen.getByText("280")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/activity/${encodeURIComponent(pdc.mmpAll["5m"]!.activityId)}`);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "60" } });
    expect(screen.getByText("350")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveTextContent(pdc.mmpAll["1m"]!.date);
    fireEvent.click(r.container.querySelector('rect[data-duration="300"]')!);
    expect(screen.getByRole("combobox")).toHaveValue("300");
    expect(screen.getByText("benchmark.timingShort")).toBeVisible();
    expect(screen.getByText("benchmark.timingNote")).not.toBeVisible();
    const guide = screen.getByText("benchmark.readingGuide").closest("details")!;
    expect(guide).not.toHaveAttribute("open");
    expect(screen.getByText(/benchmark.scope/)).toBeInTheDocument();
  });
  it.each(["loading", "missing", "partial"] as const)("explains %s references without zero values or chart", status => {
    render(<ActivityPersonalBenchmark {...props} suppliedPdcState={{ status, pdc: null }} />);
    open(); expect(screen.getByText(`benchmark.${status}`)).toBeInTheDocument(); expect(screen.queryByRole("img")).toBeNull();
  });
  it("fences account, activity and project changes and clears duration/open state", () => {
    const r = render(<ActivityPersonalBenchmark {...props} />); open();
    const old = mocks.callback;
    act(() => old?.({ exists: () => true, data: reference }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "60" } });
    r.rerender(<ActivityPersonalBenchmark {...props} activityId="another" />);
    expect(screen.queryByRole("combobox")).toBeNull(); expect(mocks.unsub).toHaveBeenCalledTimes(1);
    open(); act(() => mocks.callback?.({ exists: () => true, data: reference }));
    expect(screen.getByRole("combobox")).toHaveValue("300");
    mocks.project = "b";
    r.rerender(<ActivityPersonalBenchmark {...props} activityId="another" />);
    expect(screen.queryByRole("combobox")).toBeNull();
    act(() => old?.({ exists: () => true, data: reference }));
    expect(screen.queryByRole("img")).toBeNull();
    mocks.uid = "other";
    r.rerender(<ActivityPersonalBenchmark {...props} />);
    expect(r.container).toBeEmptyDOMElement();
  });
  it("withholds private reference for foreign owner and noncycling activity", () => {
    const r = render(<ActivityPersonalBenchmark {...props} ownerUid="foreign" />);
    expect(r.container).toBeEmptyDOMElement();
    r.rerender(<ActivityPersonalBenchmark {...props} sport="run" />);
    expect(r.container).toBeEmptyDOMElement(); expect(onSnapshot).not.toHaveBeenCalled();
  });
});
