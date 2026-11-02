import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { expect, it } from "vitest";
import { getActiveHub } from "../config/navHubs";
import { RetainedHubPages } from "./RetainedHubPages";
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
