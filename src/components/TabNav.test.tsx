import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TabNav, { RouteTabNav } from "./TabNav";

describe("TabNav", () => {
  const tabs = [
    { id: "overview", label: "개요" },
    { id: "segments", label: "세그먼트", count: 5 },
    { id: "photos", label: "사진", count: 0 },
  ];

  it("exposes tab semantics and visible keyboard focus styles", () => {
    render(<TabNav tabs={tabs} activeTab="overview" onChange={() => {}} />);

    const tablist = screen.getByRole("tablist");
    const active = within(tablist).getByRole("tab", { name: "개요" });
    const inactive = within(tablist).getByRole("tab", { name: /세그먼트/ });

    expect(active).toHaveAttribute("aria-selected", "true");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    expect(active.className).toContain("focus-visible:outline");
    expect(inactive.className).toContain("focus-visible:outline");
  });

  it("calls onChange with tab id when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabNav tabs={tabs} activeTab="overview" onChange={onChange} />);

    await user.click(screen.getByText("세그먼트"));
    expect(onChange).toHaveBeenCalledWith("segments");
  });
});

describe("RouteTabNav narrow overflow", () => {
  it("offers a next-tabs control when routes overflow", () => {
    const { container } = render(<MemoryRouter><RouteTabNav tabs={[
      { to: "/board", label: "게시판" },
      { to: "/events", label: "이벤트" },
      { to: "/friends", label: "친구" },
    ]} /></MemoryRouter>);
    const scroller = container.querySelector<HTMLElement>(".route-tab-nav__scroller")!;
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 200 });
    fireEvent(window, new Event("resize"));
    const more = screen.getByRole("button", { name: /다음 탭 보기|More tabs|button.nextTabs/ });
    fireEvent.click(more);
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    fireEvent.scroll(scroller);
    const previous = screen.getByRole("button", { name: /이전 탭 보기|Previous tabs|button.previousTabs/ });
    fireEvent.click(previous);
    expect(scroller.scrollLeft).toBe(0);
  });
});

function EventRouteTabs({ forwardState }: { forwardState: boolean }) {
  const location = useLocation();
  return <>
    <RouteTabNav tabs={[{ to: "/event/event-1?view=detail", label: "Event detail" }, { to: "/event/event-1/results?view=results#finish", label: "Event results" }]} state={forwardState ? location.state : undefined} />
    <output data-testid="tab-location">{location.pathname}{location.search}{location.hash}</output>
    <output data-testid="tab-state">{JSON.stringify(location.state)}</output>
  </>;
}
describe("RouteTabNav optional navigation state", () => {
  it("preserves detail/results origin and caller state in both directions with the locale", () => {
    const state = { fromHub: "club", selectedGroupId: "group-1" };
    render(<MemoryRouter initialEntries={[{ pathname: "/en/event/event-1", state }]}><Routes><Route path="/:lang/*" element={<EventRouteTabs forwardState />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Event results" }));
    expect(screen.getByTestId("tab-location")).toHaveTextContent("/en/event/event-1/results?view=results#finish");
    expect(JSON.parse(screen.getByTestId("tab-state").textContent!)).toEqual(state);
    fireEvent.click(screen.getByRole("link", { name: "Event detail" }));
    expect(screen.getByTestId("tab-location")).toHaveTextContent("/en/event/event-1?view=detail");
    expect(JSON.parse(screen.getByTestId("tab-state").textContent!)).toEqual(state);
  });
  it("keeps the original navigation behavior when state is omitted", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/ko/event/event-1", state: { fromHub: "club" } }]}><Routes><Route path="/:lang/*" element={<EventRouteTabs forwardState={false} />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Event results" }));
    expect(screen.getByTestId("tab-location")).toHaveTextContent("/ko/event/event-1/results?view=results#finish");
    expect(screen.getByTestId("tab-state")).toHaveTextContent("null");
  });
});

it("keeps the active route visible after late tab-width changes and respects manual browsing", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  let observed: ResizeObserverCallback | undefined;
  const observedElements: Element[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { observed = callback; }
    observe(element: Element) { observedElements.push(element); } disconnect() {}
  });
  try {
    const routes = [{ to: "/explore/courses", label: "Courses" }, { to: "/explore/challenges", label: "Challenges" }];
    const view = render(<MemoryRouter initialEntries={["/ko/explore/challenges"]}><Routes><Route path="/:lang/*" element={<RouteTabNav tabs={routes} />} /></Routes></MemoryRouter>);
    const scroller = view.container.querySelector<HTMLElement>(".route-tab-nav__scroller")!;
    const selected = screen.getByRole("link", { name: "Challenges" });
    const width = () => 200 - view.container.querySelectorAll(".route-tab-nav__more").length * 32;
    Object.defineProperties(scroller, { scrollWidth: { configurable: true, value: 600 }, clientWidth: { configurable: true, get: width } });
    scroller.getBoundingClientRect = () => ({ left: 0, right: width(), width: width() }) as DOMRect;
    let precedingTabGrowth = 0;
    selected.getBoundingClientRect = () => ({ left: 400 + precedingTabGrowth - scroller.scrollLeft, right: 500 + precedingTabGrowth - scroller.scrollLeft, width: 100 }) as DOMRect;
    fireEvent(window, new Event("resize"));
    const flush = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });
    flush(); flush();
    expect(selected.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(selected.getBoundingClientRect().right).toBeLessThanOrEqual(width());
    expect(selected).toHaveAttribute("aria-current", "page");
    expect(observedElements).toEqual(expect.arrayContaining([scroller, screen.getByRole("link", { name: "Courses" }), selected]));
    // A late font load grows a preceding tab after the initial frames settled.
    precedingTabGrowth = 80;
    expect(selected.getBoundingClientRect().right).toBeGreaterThan(width());
    act(() => observed?.([], {} as ResizeObserver));
    flush(); flush();
    expect(selected.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(selected.getBoundingClientRect().right).toBeLessThanOrEqual(width());
    fireEvent.pointerDown(scroller);
    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    precedingTabGrowth += 40;
    act(() => observed?.([], {} as ResizeObserver));
    flush(); flush();
    expect(scroller.scrollLeft).toBe(0);
    expect(view.container.querySelectorAll(".route-tab-nav__more")).toHaveLength(2);
    const reservedBack = view.container.querySelector<HTMLButtonElement>(".route-tab-nav__more")!;
    expect(reservedBack).toBeDisabled();
    expect(reservedBack).toHaveStyle({ visibility: "hidden" });
    expect(width()).toBe(136);
    expect(screen.getByRole("link", { name: "Courses" })).toBeInTheDocument();
    view.unmount();
  } finally { vi.unstubAllGlobals(); }
});

function AliasRouteTabs() {
  const location=useLocation();
  return <><RouteTabNav tabs={[{to:"/club/group-1",label:"News",end:true},{to:"/club/group-1/events?sport=bike",label:"Meetings",activePaths:["/club/group-1/meetings"]}]} state={location.state}/><output data-testid="alias-location">{location.pathname}{location.search}</output><output data-testid="alias-state">{JSON.stringify(location.state)}</output></>;
}
describe("RouteTabNav active route aliases",()=>{
  it("matches localized child routes while preserving the real href and navigation state",()=>{
    render(<MemoryRouter initialEntries={[{pathname:"/en/club/group-1/meetings/meeting-1/edit",state:{fromHub:"club"}}]}><Routes><Route path="/:lang/*" element={<AliasRouteTabs/>}/></Routes></MemoryRouter>);
    const meeting=screen.getByRole("link",{name:"Meetings"});expect(meeting).toHaveAttribute("aria-current","page");expect(meeting).toHaveAttribute("href","/en/club/group-1/events?sport=bike");expect(screen.getByRole("link",{name:"News"})).not.toHaveAttribute("aria-current");
    fireEvent.click(meeting);expect(screen.getByTestId("alias-location")).toHaveTextContent("/en/club/group-1/events?sport=bike");expect(screen.getByTestId("alias-state")).toHaveTextContent('{"fromHub":"club"}');expect(screen.getByRole("link",{name:"Meetings"})).toHaveAttribute("aria-current","page");
  });
  it("does not match a similarly named unrelated route",()=>{
    render(<MemoryRouter initialEntries={["/ko/club/group-1/meetings-archive"]}><Routes><Route path="/:lang/*" element={<AliasRouteTabs/>}/></Routes></MemoryRouter>);expect(screen.getByRole("link",{name:"Meetings"})).not.toHaveAttribute("aria-current");
  });
  it("reveals an active alias in a narrow tab scroller",()=>{
    const frames=new Map<number,FrameRequestCallback>();let next=0;
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next;});vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
    try{
      const view=render(<MemoryRouter initialEntries={["/ko/club/group-1/meetings/new"]}><Routes><Route path="/:lang/*" element={<AliasRouteTabs/>}/></Routes></MemoryRouter>);const scroller=view.container.querySelector<HTMLElement>(".route-tab-nav__scroller")!;const active=screen.getByRole("link",{name:"Meetings"});
      Object.defineProperties(scroller,{scrollWidth:{configurable:true,value:600},clientWidth:{configurable:true,value:160}});scroller.getBoundingClientRect=()=>({left:0,right:160,width:160}) as DOMRect;active.getBoundingClientRect=()=>({left:400-scroller.scrollLeft,right:500-scroller.scrollLeft,width:100}) as DOMRect;
      fireEvent(window,new Event("resize"));const flush=()=>act(()=>{const scheduled=[...frames.values()];frames.clear();scheduled.forEach(callback=>callback(0));});flush();flush();expect(active).toHaveAttribute("aria-current","page");expect(active.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);expect(active.getBoundingClientRect().right).toBeLessThanOrEqual(160);view.unmount();
    }finally{vi.unstubAllGlobals();}
  });
});
