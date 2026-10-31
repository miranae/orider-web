import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { FirebaseServicesProvider, type FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  setDocData,
} from "../../../__tests__/mocks/firebase";
import { EquipmentSignalCard, parseEquipmentSignalProjection } from "./EquipmentSignalCard";

const projection = {
  schemaVersion: "equipment-signal-owner-projection-v1",
  projectionKind: "owner_equipment_signal",
  ownerId: "test-uid",
  activityId: "ride-1",
  signalId: "signal-1",
  status: "active",
  exposure: "eligible",
  actionCode: "CHECK_BRAKE_RUB",
  guidanceKey: "coach.equipment.guidance.check_brake_rub",
  evidence: [{
    evidenceId: "ev-1",
    sourceActivityId: "ride-1",
    sourceRevision: "revision-7",
    field: "residual_watts",
    value: 19.25,
    unit: "W",
    startSec: 120,
    endSec: 180,
    startKm: 3.5,
    endKm: 4.1,
    detectorVersion: "channel-a-v1",
    asOf: "2026-07-18T01:02:03.000Z",
  }],
} as const;

describe("EquipmentSignalCard", () => {
  it("accepts only the eligible owner projection contract", () => {
    expect(parseEquipmentSignalProjection(projection, { activityId: "ride-1", ownerId: "test-uid" }))
      .toMatchObject({ signalId: "signal-1", actionCode: "CHECK_BRAKE_RUB" });
    expect(parseEquipmentSignalProjection({ ...projection, status: "dismissed" }, { activityId: "ride-1", ownerId: "test-uid" }))
      .toBeNull();
    expect(parseEquipmentSignalProjection({ ...projection, exposure: "suppressed" }, { activityId: "ride-1", ownerId: "test-uid" }))
      .toBeNull();
    expect(parseEquipmentSignalProjection({ ...projection, ownerId: "other" }, { activityId: "ride-1", ownerId: "test-uid" }))
      .toBeNull();
    expect(parseEquipmentSignalProjection({ ...projection, guidanceKey: "equipment.guidance.made_up" }, { activityId: "ride-1", ownerId: "test-uid" }))
      .toBeNull();
  });

  it.each([
    ["extra top-level field", (raw: Record<string, any>) => { raw.confidence = "high"; }],
    ["empty identity", (raw: Record<string, any>) => { raw.signalId = ""; }],
    ["extra evidence field", (raw: Record<string, any>) => { raw.evidence[0].probability = 0.9; }],
    ["cross-activity evidence", (raw: Record<string, any>) => { raw.evidence[0].sourceActivityId = "ride-2"; }],
    ["negative range", (raw: Record<string, any>) => { raw.evidence[0].startSec = -1; }],
    ["reversed time range", (raw: Record<string, any>) => { raw.evidence[0].endSec = 119; }],
    ["reversed distance range", (raw: Record<string, any>) => { raw.evidence[0].endKm = 3; }],
    ["non-finite range", (raw: Record<string, any>) => { raw.evidence[0].startKm = Number.NaN; }],
    ["invalid asOf", (raw: Record<string, any>) => { raw.evidence[0].asOf = "yesterday"; }],
    ["duplicate evidence id", (raw: Record<string, any>) => { raw.evidence.push({ ...raw.evidence[0] }); }],
    ["more than eight evidence records", (raw: Record<string, any>) => {
      raw.evidence = Array.from({ length: 9 }, (_, index) => ({ ...raw.evidence[0], evidenceId: `ev-${index}` }));
    }],
  ])("rejects %s", (_name, mutate) => {
    const raw = structuredClone(projection) as unknown as Record<string, any>;
    mutate(raw);
    expect(parseEquipmentSignalProjection(raw, { activityId: "ride-1", ownerId: "test-uid" })).toBeNull();
  });

  it("renders static guidance and every server evidence field without probability language", async () => {
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );

    expect(await screen.findByRole("region", { name: "브레이크 간섭을 점검해 보세요" })).toBeInTheDocument();
    expect(screen.getByText("residual_watts: 19.25 W")).toBeInTheDocument();
    expect(screen.getByText("120–180 s · 3.5–4.1 km")).toBeInTheDocument();
    expect(screen.getByText(/ev-1/)).toBeInTheDocument();
    expect(screen.getByText(/revision-7/)).toBeInTheDocument();
    expect(screen.getByText(/channel-a-v1/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-18T01:02:03.000Z/)).toBeInTheDocument();
    expect(screen.queryByText(/확률|probability|confidence/i)).not.toBeInTheDocument();
  });

  it("does not subscribe or render for a non-owner viewer", () => {
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="other-user" />,
      { authenticated: true, user: { uid: "other-user" } },
    );
    expect(screen.queryByText("장비 점검 권고")).not.toBeInTheDocument();
  });

  it("dismisses through the callable and hides the card after success", async () => {
    const user = userEvent.setup();
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    setCallableResult("dismissEquipmentSignalCallable", { data: { result: "dismissed" } });
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );

    await user.click(await screen.findByRole("button", { name: "확인했어요 · 숨기기" }));
    await waitFor(() => expect(screen.queryByText("브레이크 간섭을 점검해 보세요")).not.toBeInTheDocument());
    expect(mockCallableInvocations).toContainEqual({
      name: "dismissEquipmentSignalCallable",
      data: { activityId: "ride-1", signalId: "signal-1" },
    });
  });

  it.each([
    ["dismissed", "dismissed"],
    ["inactive", "inactive"],
    ["suppressed", "suppressed"],
  ])("hides a live listener transition to %s without showing a load warning", async (status, exposure) => {
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );
    expect(await screen.findByText("브레이크 간섭을 점검해 보세요")).toBeInTheDocument();

    setDocData("equipment_signal_exposures/ride-1", {
      ...projection,
      status,
      exposure,
      dismissedAt: "server timestamp",
    });
    await waitFor(() => expect(screen.queryByText("브레이크 간섭을 점검해 보세요")).not.toBeInTheDocument());
    expect(screen.queryByText("점검 권고를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("stays hidden after dismiss when the activity is revisited", async () => {
    const user = userEvent.setup();
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    setCallableImplementation("dismissEquipmentSignalCallable", () => {
      setDocData("equipment_signal_exposures/ride-1", {
        ...projection,
        status: "dismissed",
        exposure: "dismissed",
        dismissedAt: "server timestamp",
      });
      return { data: { result: "dismissed" } };
    });
    const firstVisit = renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );
    await user.click(await screen.findByRole("button", { name: "확인했어요 · 숨기기" }));
    await waitFor(() => expect(screen.queryByText("브레이크 간섭을 점검해 보세요")).not.toBeInTheDocument());
    firstVisit.unmount();

    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );
    await waitFor(() => expect(screen.queryByLabelText("장비 점검 권고 확인 중")).not.toBeInTheDocument());
    expect(screen.queryByText("브레이크 간섭을 점검해 보세요")).not.toBeInTheDocument();
    expect(screen.queryByText("점검 권고를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("shows the retry warning only for a malformed active projection", async () => {
    setDocData("equipment_signal_exposures/ride-1", {
      ...projection,
      confidence: "high",
    });
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );
    expect(await screen.findByText("점검 권고를 불러오지 못했습니다")).toBeInTheDocument();
  });

  it("keeps the recommendation visible and announces a dismiss error", async () => {
    const user = userEvent.setup();
    setDocData("equipment_signal_exposures/ride-1", projection as unknown as Record<string, unknown>);
    setCallableImplementation("dismissEquipmentSignalCallable", () => {
      throw new Error("offline");
    });
    renderWithProviders(
      <EquipmentSignalCard activityId="ride-1" ownerId="test-uid" viewerId="test-uid" />,
      { authenticated: true },
    );

    await user.click(await screen.findByRole("button", { name: "확인했어요 · 숨기기" }));
    expect(await screen.findByText("권고를 숨기지 못했습니다. 다시 시도해 주세요.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("브레이크 간섭을 점검해 보세요")).toBeInTheDocument();
  });
});


describe("EquipmentSignalCard named SDK lifecycle", () => {
  type Snapshot = { exists: () => boolean; data: () => unknown };
  let listeners: Array<{ next: (snapshot: Snapshot) => void; fail: (error: Error) => void; stop: ReturnType<typeof vi.fn> }>;
  let authChanges: Array<() => void>;
  const named = (name: string) => {
    const app = { name };
    return { auth: { app, currentUser: { uid: "test-uid", isAnonymous: false } },
      firestore: { app }, functions: { app }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
      getAppCheckToken: vi.fn().mockResolvedValue(null) } as unknown as FirebaseServices;
  };
  const tree = (services: FirebaseServices, activityId = "ride-1", viewerId = "test-uid") =>
    <FirebaseServicesProvider services={services}><EquipmentSignalCard activityId={activityId} ownerId="test-uid" viewerId={viewerId} /></FirebaseServicesProvider>;
  const emit = (index: number, value: unknown = projection) => act(() => listeners[index].next({ exists: () => true, data: () => value }));
  beforeEach(() => {
    listeners = []; authChanges = [];
    vi.mocked(onSnapshot).mockImplementation(((...args: unknown[]) => {
      const stop = vi.fn();
      listeners.push({ next: args[1] as (s: Snapshot) => void, fail: args[2] as (e: Error) => void, stop });
      return stop;
    }) as typeof onSnapshot);
    vi.mocked(onAuthStateChanged).mockImplementation(((_auth: unknown, next: () => void) => {
      authChanges.push(next); return vi.fn();
    }) as typeof onAuthStateChanged);
  });
  afterEach(() => { vi.mocked(onSnapshot).mockReset(); vi.mocked(onAuthStateChanged).mockReset(); });

  it("uses the injected Firestore, Functions and AppCheck for owner reads and dismissal", async () => {
    const services = named("embedded-owner");
    const view = render(tree(services));
    expect(doc).toHaveBeenCalledWith(services.firestore, "equipment_signal_exposures", "ride-1");
    emit(0);
    await userEvent.click(screen.getByRole("button", { name: "확인했어요 · 숨기기" }));
    expect(services.ensureAppCheckReady).toHaveBeenCalledTimes(1);
    expect(httpsCallable).toHaveBeenCalledWith(services.functions, "dismissEquipmentSignalCallable");
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    view.unmount(); expect(listeners[0].stop).toHaveBeenCalledTimes(1);
  });

  it("does not read owner evidence when the SDK user is not the prop owner", () => {
    const services = named("wrong-owner");
    Object.assign(services.auth.currentUser!, { uid: "another" });
    render(tree(services)); expect(listeners).toHaveLength(0);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("blocks a pending AppCheck dismissal after same-UID named SDK replacement", async () => {
    const a = named("a"), b = named("b");
    let ready!: () => void;
    vi.mocked(a.ensureAppCheckReady).mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
    const view = render(tree(a)); emit(0);
    await userEvent.click(screen.getByRole("button", { name: "확인했어요 · 숨기기" }));
    view.rerender(tree(b));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    emit(1);
    a.auth.currentUser = null;
    act(() => authChanges[0]());
    await act(async () => { ready(); });
    expect(httpsCallable).not.toHaveBeenCalledWith(a.functions, "dismissEquipmentSignalCallable");
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(listeners[0].stop).toHaveBeenCalledTimes(1);
  });

  it("ignores stale snapshot and callable results after activity change and cleanup", async () => {
    const services = named("owner"); let finish!: (value: unknown) => void;
    setCallableImplementation("dismissEquipmentSignalCallable", () => new Promise(resolve => { finish = resolve; }));
    const view = render(tree(services)); emit(0);
    await userEvent.click(screen.getByRole("button", { name: "확인했어요 · 숨기기" }));
    view.rerender(tree(services, "ride-2"));
    emit(1, { ...projection, activityId: "ride-2", evidence: projection.evidence.map(e => ({ ...e, sourceActivityId: "ride-2" })) });
    emit(0);
    await act(async () => { finish({ data: { result: "dismissed" } }); });
    expect(screen.getByRole("region")).toBeInTheDocument();
    view.unmount(); emit(1); expect(listeners[1].stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("removes owner evidence on exact-user replacement before stale callbacks return", () => {
    const services = named("owner"); render(tree(services)); emit(0);
    services.auth.currentUser = { ...services.auth.currentUser! };
    act(() => authChanges[0]()); emit(0);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("contains synchronous subscription errors and logs with the named SDK", async () => {
    const services = named("owner");
    vi.mocked(onSnapshot).mockImplementationOnce(() => { throw new Error("unavailable"); });
    render(<><p>Stored analysis remains</p>{tree(services)}</>);
    expect(screen.getByText("Stored analysis remains")).toBeInTheDocument();
    expect(screen.getByText("점검 권고를 불러오지 못했습니다")).toBeInTheDocument();
    await waitFor(() => expect(httpsCallable).toHaveBeenCalledWith(services.functions, "logClientError"));
  });
});
