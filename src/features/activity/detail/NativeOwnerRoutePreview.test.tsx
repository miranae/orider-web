import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TFunction } from "i18next";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import NativeOwnerRoutePreview, { boundedRoutePreview } from "./NativeOwnerRoutePreview";
const mock = vi.hoisted(() => ({ load: vi.fn(), user: { uid: "owner", isAnonymous: false }, authListener: null as null | ((u: unknown) => void) }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mock.user }) }));
const services = { auth: { currentUser: mock.user, app: { name: "local", options: { projectId: "demo-route" } } } };
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => services }));
vi.mock("../../../services/activityRouteEvidence", () => ({ loadActivityRouteEvidence: (...args: unknown[]) => mock.load(...args) }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: typeof mock.authListener) => { mock.authListener = callback; return () => {}; } }));
vi.mock("../../../components/RouteMap", () => ({ default: ({ latlng }: { latlng: unknown[] }) => <div data-testid="preview-map">{latlng.length}</div> }));
const t = ((key: string) => key) as TFunction<"activity">;
const activity = createMockActivity({ id: "ride", userId: "owner", source: "orider" });
const ready = { state: "available", route: { points: Array.from({ length: 601 }, (_, i) => ({ lat: 37 + i / 10000, lon: 127 })) } };
beforeEach(() => { mock.load.mockReset(); services.auth.currentUser = mock.user; });
it("reads only after explicit action and bounds the preview while retaining endpoints", async () => {
 mock.load.mockResolvedValue(ready); render(<NativeOwnerRoutePreview activity={activity} t={t} />);
 expect(mock.load).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button"));
 expect(await screen.findByTestId("preview-map")).toHaveTextContent("200");
 const points = boundedRoutePreview(ready.route.points); expect(points[0]).toEqual([37,127]); expect(points.at(-1)).toEqual([37.06,127]);
});
it("does not automatically retry missing GPS", async () => {
 mock.load.mockResolvedValue({ state:"unavailable",reason:"missing_gps" }); render(<NativeOwnerRoutePreview activity={activity} t={t} />);
 fireEvent.click(screen.getByRole("button")); await screen.findByText("page.ownerRoutePreview.empty"); expect(screen.queryByRole("button")).toBeNull(); expect(mock.load).toHaveBeenCalledTimes(1);
});
it.each(["contentRevision", "sourceRevision", "sourceContentDigest"])("discards an old %s response before showing a new route", async revisionField => {
 let resolve!: (v: unknown) => void; mock.load.mockReturnValue(new Promise(r => { resolve = r; }));
 const view = render(<NativeOwnerRoutePreview activity={activity} t={t} />); fireEvent.click(screen.getByRole("button"));
 view.rerender(<NativeOwnerRoutePreview activity={{...activity, [revisionField]: 2}} t={t} />);
 await act(async () => resolve(ready)); expect(screen.queryByTestId("preview-map")).toBeNull(); expect(screen.getByRole("button")).toBeEnabled();
});
it("clears a visible route and aborts acceptance when SDK identity changes", async () => {
 mock.load.mockResolvedValue(ready); render(<NativeOwnerRoutePreview activity={activity} t={t} />); fireEvent.click(screen.getByRole("button")); await screen.findByTestId("preview-map");
 act(() => mock.authListener?.({uid:"other",isAnonymous:false})); await waitFor(() => expect(screen.queryByTestId("preview-map")).toBeNull());
});
it("never offers another owner's route", () => { render(<NativeOwnerRoutePreview activity={{...activity,userId:"other"}} t={t} />); expect(screen.queryByRole("button")).toBeNull(); expect(mock.load).not.toHaveBeenCalled(); });

it("does not retain points when the SDK project changes", async () => {
 mock.load.mockResolvedValue(ready); const view = render(<NativeOwnerRoutePreview activity={activity} t={t} />); fireEvent.click(screen.getByRole("button")); await screen.findByTestId("preview-map");
 services.auth.app.options.projectId="demo-other"; view.rerender(<NativeOwnerRoutePreview activity={activity} t={t} />); expect(screen.queryByTestId("preview-map")).toBeNull(); services.auth.app.options.projectId="demo-route";
});
