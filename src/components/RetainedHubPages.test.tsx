import { useEffect, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { getActiveHub } from "../config/navHubs";
import { RetainedHubPages, retainedScreenKey } from "./RetainedHubPages";
import { HUB_RETURN_STATE } from "../services/hubReturn";

function Page({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  const location = useLocation();
  return <section aria-label={name}><button onClick={() => setCount(count + 1)}>{name}:{count}</button><p>{name} sees {location.pathname}{location.search}</p></section>;
}
function Shell({ owner = "u1" }: { owner?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const page = path === "/" ? <Page name="home" /> : path.startsWith("/coach/") ? <Page name="coach" /> : <Page name="detail" />;
  return <>
    <button onClick={() => navigate("/")}>Home tab</button>
    <button onClick={() => navigate("/coach/condition?sport=tri")}>Coach tab</button>
    <button onClick={() => navigate("/activity/a1")}>Detail</button>
    <RetainedHubPages path={path} hub={getActiveHub(path)} owner={owner}>{page}</RetainedHubPages>
  </>;
}

it("다른 탭에 다녀와도 화면을 다시 열지 않고 상태를 그대로 보여 주며, 숨긴 화면은 자기 위치를 본다", () => {
  render(<MemoryRouter initialEntries={["/coach/condition?sport=tri"]}><Shell /></MemoryRouter>);
  fireEvent.click(screen.getByText("coach:0"));
  fireEvent.click(screen.getByText("Home tab"));
  expect(screen.getByRole("region", { name: "home" })).toBeVisible();
  expect(screen.getByText("coach:1")).not.toBeVisible();
  expect(screen.getByText("coach sees /coach/condition?sport=tri")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Coach tab"));
  expect(screen.getByText("coach:1")).toBeVisible();
  expect(screen.getByText("home:0")).not.toBeVisible();
});

it("상세는 살려 두지 않고, 상세를 보는 동안 허브 화면은 숨겨 둔다", () => {
  render(<MemoryRouter initialEntries={["/"]}><Shell /></MemoryRouter>);
  fireEvent.click(screen.getByText("home:0"));
  fireEvent.click(screen.getByText("Detail"));
  expect(screen.getByRole("region", { name: "detail" })).toBeVisible();
  expect(screen.getByText("home:1")).not.toBeVisible();
  fireEvent.click(screen.getByText("Home tab"));
  expect(screen.getByText("home:1")).toBeVisible();
  expect(screen.queryByRole("region", { name: "detail" })).not.toBeInTheDocument();
});

it("계정이 바뀌면 이전 계정의 화면을 버린다", () => {
  const view = render(<MemoryRouter initialEntries={["/"]}><Shell owner="u1" /></MemoryRouter>);
  fireEvent.click(screen.getByText("home:0"));
  view.rerender(<MemoryRouter initialEntries={["/"]}><Shell owner="u2" /></MemoryRouter>);
  expect(screen.getByText("home:0")).toBeVisible();
});

function KeyPage() {
  const location = useLocation();
  return <p>key:{location.key}</p>;
}
it("탭으로 같은 화면에 돌아오면 새 방문(location.key)으로 보지 않는다", () => {
  function KeyShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const path = location.pathname;
    return <>
      <button onClick={() => navigate("/", { state: HUB_RETURN_STATE })}>Home tab</button>
      <button onClick={() => navigate("/coach/condition")}>Coach tab</button>
      <button onClick={() => navigate("/")}>Home link</button>
      <RetainedHubPages path={path} hub={getActiveHub(path)} owner="u1">{path === "/" ? <KeyPage /> : <p>coach</p>}</RetainedHubPages>
    </>;
  }
  render(<MemoryRouter initialEntries={["/"]}><KeyShell /></MemoryRouter>);
  const first = screen.getByText(/^key:/).textContent;
  fireEvent.click(screen.getByText("Coach tab"));
  fireEvent.click(screen.getByText("Home tab"));
  expect(screen.getByText(/^key:/).textContent).toBe(first);
  fireEvent.click(screen.getByText("Coach tab"));
  fireEvent.click(screen.getByText("Home link"));
  expect(screen.getByText(/^key:/).textContent).not.toBe(first);
});

it("코치 컨디션·오늘·분석은 한 화면으로, 계획·목표는 따로 살려 둔다", () => {
  expect(retainedScreenKey("/coach/condition")).toBe(retainedScreenKey("/coach/analysis"));
  expect(retainedScreenKey("/coach/today")).toBe("/coach/fitness");
  expect(retainedScreenKey("/coach/plan")).toBe("/coach/plan");
  expect(retainedScreenKey("/coach/goals")).toBe("/coach/goals");
});

it("같은 허브의 다른 하위 화면에 다녀와도 먼저 본 하위 화면의 상태를 그대로 보여 준다", () => {
  function SubShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const path = location.pathname;
    return <>
      <button onClick={() => navigate("/coach/plan")}>Plan</button>
      <button onClick={() => navigate("/coach/analysis")}>Analysis</button>
      <RetainedHubPages path={path} hub={getActiveHub(path)} owner="u1">{path === "/coach/plan" ? <Page name="plan" /> : <Page name="fitness" />}</RetainedHubPages>
    </>;
  }
  render(<MemoryRouter initialEntries={["/coach/condition"]}><SubShell /></MemoryRouter>);
  fireEvent.click(screen.getByText("fitness:0"));
  fireEvent.click(screen.getByText("Plan"));
  expect(screen.getByText("fitness:1")).not.toBeVisible();
  fireEvent.click(screen.getByText("Analysis"));
  expect(screen.getByText("fitness:1")).toBeVisible();
});

function CourseSearch() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const query = params.get("q") ?? "";
  // CoursesPage 와 같은 250ms 검색 디바운스 — 숨긴 뒤에도 타이머는 살아 있다.
  useEffect(() => {
    if (value.trim() === query) return;
    const timer = setTimeout(() => setParams({ q: value.trim() }, { replace: true }), 250);
    return () => clearTimeout(timer);
  }, [value, query, setParams]);
  return <input aria-label="course search" value={value} onChange={event => setValue(event.target.value)} />;
}
function SearchShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const page = path.startsWith("/explore/") ? <CourseSearch /> : <Page name="coach" />;
  return <>
    <button onClick={() => navigate("/coach/condition")}>Coach tab</button>
    <button onClick={() => navigate("/explore/courses")}>Explore tab</button>
    <p data-testid="router-location">{location.pathname}{location.search}</p>
    <RetainedHubPages path={path} hub={getActiveHub(path)} owner="u1">{page}</RetainedHubPages>
  </>;
}

it("숨긴 화면의 늦은 검색 디바운스가 사용자가 고른 탭을 되돌리지 않고, 돌아오면 검색 상태를 반영한다(#1461)", () => {
  vi.useFakeTimers();
  try {
    render(<MemoryRouter initialEntries={["/explore/courses"]}><SearchShell /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("course search"), { target: { value: "seoul" } });
    fireEvent.click(screen.getByText("Coach tab"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("router-location")).toHaveTextContent("/coach/condition");
    fireEvent.click(screen.getByText("Explore tab"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("router-location")).toHaveTextContent("/explore/courses?q=seoul");
    expect(screen.getByLabelText("course search")).toHaveValue("seoul");
  } finally { vi.useRealTimers(); }
});
