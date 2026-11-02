import { getDoc } from "firebase/firestore";
import { installEventDiscoveryFixture } from "../__tests__/fixtures/eventDiscovery";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setCallableImplementation, mockCallableInvocations } from "../__tests__/mocks/firebase";
import eventStrings from "../i18n/resources/ko/event.json";
import EventsPage from "./EventsPage";

const { fitBounds, mapClick } = vi.hoisted(() => ({ fitBounds: vi.fn(), mapClick: vi.fn() }));
vi.mock("react-map-gl/mapbox", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  return {
    default: forwardRef(function Map({ children, onLoad }: { children: React.ReactNode; onLoad?: () => void }, ref) {
      useImperativeHandle(ref, () => ({ fitBounds }), []);
      useEffect(() => { onLoad?.(); }, [onLoad]);
      return <div data-testid="map-stub" onClick={mapClick}>{children}</div>;
    }),
    Marker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Popup: ({ children, onClose, closeOnClick, anchor, maxWidth, style }: { children: React.ReactNode; onClose: () => void; closeOnClick?: boolean; anchor?: string; maxWidth?: string; style?: React.CSSProperties }) => <div role="dialog" data-close-on-click={String(closeOnClick)} data-anchor={anchor ?? "auto"} style={{ ...style, maxWidth }}><button onClick={onClose}>Close popup</button>{children}</div>,
  };
});
const gpx = (lat: number, lng: number) => `<gpx><trk><trkseg><trkpt lat="${lat}" lon="${lng}"/><trkpt lat="${lat + 0.01}" lon="${lng + 0.01}"/></trkseg></trk></gpx>`;

beforeEach(() => { installEventDiscoveryFixture(); fitBounds.mockClear(); mapClick.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("event map camera intent", () => {
  it("stops on rejected continuation and restarts from the first page only after Retry", async () => {
    const token="~ed1_"+"e".repeat(48);
    setCallableImplementation("listVisibleEventEnvelopes",input=>{
      if((input as {cursor?:string}).cursor)throw new Error("Unavailable cursor");
      return {data:{rows:[],nextCursor:token}};
    });
    renderWithProviders(<EventsPage/>,{route:"/ko/explore/events"});
    fireEvent.click(await screen.findByRole("button",{name:eventStrings["message.next"],exact:true}));
    await screen.findByText(eventStrings["dashboard.errorLoadEvent"]);
    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:/다시|retry/i}));
    await screen.findByRole("button",{name:eventStrings["message.next"],exact:true});
    const calls=mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes");
    expect(calls).toHaveLength(3);expect(calls[2].data).not.toHaveProperty("cursor");
  });

  it("does not continue or hydrate course data when a pending discovery response arrives after navigation", async () => {
    let finish!:(value:unknown)=>void;
    setCallableImplementation("listVisibleEventEnvelopes",()=>new Promise(resolve=>{finish=resolve;}));
    const view=renderWithProviders(<EventsPage/>,{route:"/ko/explore/events"});
    await waitFor(()=>expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes")).toHaveLength(1));
    view.unmount();vi.mocked(getDoc).mockClear();
    await act(async()=>finish({data:{rows:[{id:"late",data:{info:{status:"OPEN",visibility:"PUBLIC",courseIds:["no-read-after-navigation"]}}}],nextCursor:"~ed1_"+"d".repeat(48)}}));
    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes")).toHaveLength(1);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("keeps an incomplete private window bounded until Next and then shows public, legacy and GROUP rows", async () => {
    const token="~ed1_"+"c".repeat(48);
    setCallableImplementation("listVisibleEventEnvelopes", input => {
      const request=input as {cursor?:string};
      return {data:request.cursor ? {rows:[
        {id:"prefix-public",data:{info:{name:"Public after private prefix",status:"OPEN",visibility:"PUBLIC",startTime:Date.now()+60_000}}},
        {id:"prefix-legacy",data:{info:{name:"Legacy after private prefix",status:"OPEN",startTime:Date.now()+60_000}}},
        {id:"prefix-group",data:{info:{name:"GROUP after private prefix",status:"OPEN",visibility:"GROUP",startTime:Date.now()+60_000}}},
      ],nextCursor:null} : {rows:[],nextCursor:token}};
    });
    renderWithProviders(<EventsPage/>,{route:"/ko/explore/events"});
    const next=await screen.findByRole("button",{name:eventStrings["message.next"],exact:true});
    expect(screen.queryByText(eventStrings["empty.noEvents"])).not.toBeInTheDocument();
    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes")).toHaveLength(1);
    fireEvent.click(next);
    for(const name of ["Public after private prefix","Legacy after private prefix","GROUP after private prefix"])expect(await screen.findByText(name,{exact:true})).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes")).toHaveLength(2);
  });

  it("fits late URL GPX data and explicit filters while preserving the camera during ordinary renders", async () => {
    let finishGpx!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finishGpx = resolve; })));
    setCollectionDocs("events", [
      { id: "late", info: { name: "Late route", status: "FINISHED", type: "TOUR", visibility: "PUBLIC", region: "서울", startTime: 1000, courseGpx: "https://example.test/late.gpx" } },
      { id: "ready", info: { name: "Ready route", status: "FINISHED", type: "GRANFONDO", visibility: "PUBLIC", region: "부산", startTime: 2000, courseGpx: gpx(35, 129) } },
    ]);
    const view = renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["view.map"], exact: true }));
    await screen.findByTestId("map-stub");
    await waitFor(() => expect(fitBounds).toHaveBeenCalled());
    fitBounds.mockClear();
    await act(async () => finishGpx({ ok: true, text: async () => gpx(37.5, 127) } as Response));
    await waitFor(() => expect(fitBounds).toHaveBeenCalledWith([[127, 35], [129, 37.5]], expect.objectContaining({ duration: 0 })));
    fireEvent.click(screen.getByText(eventStrings["filter.more"]));
    fitBounds.mockClear();
    fireEvent.click(screen.getByRole("combobox", { name: eventStrings["filter.region"] }));
    fireEvent.click(screen.getByRole("option", { name: "서울", exact: true }));
    await waitFor(() => expect(fitBounds).toHaveBeenCalledWith([[127, 37.5], [127, 37.5]], expect.anything()));
    fitBounds.mockClear();
    view.rerender(<EventsPage />);
    expect(fitBounds).not.toHaveBeenCalled();
  }, 15000);
  it("keeps seven weekdays and full accessible event names in the compact calendar", async () => {
    const name = "Full event title retained for calendar navigation";
    const date = new Date();
    date.setDate(15);
    setCollectionDocs("events", [{ id: "calendar-event", info: { name, status: "FINISHED", type: "TOUR", visibility: "PUBLIC", startTime: date.getTime() } }]);
    renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["view.calendar"], exact: true }));
    const calendar = await screen.findByTestId("E3-3");
    expect(calendar.querySelectorAll(".event-calendar-weekday")).toHaveLength(7);
    expect(calendar.querySelectorAll(".event-calendar-day")).toHaveLength(42);
    const cellEvent = within(calendar).getByRole("link", { name });
    expect(cellEvent).toHaveAttribute("title", name);
    expect(cellEvent).toHaveClass("event-calendar-event");
    const agenda = screen.getByRole("region", { hidden: true });
    expect(agenda).toHaveAttribute("aria-label", eventStrings["view.monthEvents"].replace("{{count}}", "1"));
    expect(within(agenda).getByText(name, { exact: true })).toHaveAttribute("href", "/ko/event/calendar-event");
    expect(within(agenda).getByText(eventStrings["action.viewDetails"], { exact: true })).toHaveAttribute("href", "/ko/event/calendar-event");
    expect(agenda.querySelector("time")).toHaveAttribute("datetime", date.toISOString());
  });

  it("distinguishes an empty selected month from the overall filtered events", async () => {
    // 지난달 15일. 31일에 setMonth(-1) 하면 없는 날짜(9/31 등)가 이번 달 1일로 넘어가 테스트가 깨진다.
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    setCollectionDocs("events", [{ id: "previous", info: { name: "Previous month event", status: "FINISHED", type: "TOUR", visibility: "PUBLIC", startTime: previousMonth.getTime() } }]);
    renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["view.calendar"], exact: true }));
    expect(await screen.findByText(eventStrings["view.noMonthEvents"])).toBeInTheDocument();
    expect(screen.getByRole("region", { hidden: true })).toHaveAttribute("aria-label", eventStrings["view.monthEvents"].replace("{{count}}", "0"));
  });

  it("keeps marker selection open without bubbling the marker click and permits selection and closing", async () => {
    setCollectionDocs("events", [
      { id: "first", info: { name: "First marker", status: "FINISHED", type: "TOUR", visibility: "PUBLIC", startTime: 1000, courseGpx: gpx(35, 129) } },
      { id: "second", info: { name: "Second marker", status: "FINISHED", type: "TOUR", visibility: "PUBLIC", startTime: 2000, courseGpx: gpx(37.5, 127) } },
    ]);
    renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["view.map"], exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "First marker" }));
    let popup = await screen.findByRole("dialog");
    expect(popup).toHaveAttribute("data-close-on-click", "false");
    expect(popup).toHaveAttribute("data-anchor", "auto");
    expect(popup).toHaveStyle({ minWidth: "180px", maxWidth: "min(320px, calc(100% - var(--space-4)))" });
    expect(within(popup).getByText("First marker")).toBeInTheDocument();
    expect(within(popup).getByRole("link")).toHaveAttribute("href", "/ko/event/first");
    expect(mapClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Second marker" }));
    popup = screen.getByRole("dialog");
    expect(within(popup).getByText("Second marker")).toBeInTheDocument();
    expect(within(popup).getByRole("link")).toHaveAttribute("href", "/ko/event/second");
    expect(mapClick).not.toHaveBeenCalled();
    fireEvent.click(within(popup).getByRole("button", { name: "Close popup" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

});
