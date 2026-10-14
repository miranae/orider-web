import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LocalizedLink } from "./LocalizedLink";
import { resolveDetailHub } from "../config/navHubs";
function Probe() { const location = useLocation(); return <output data-testid="state">{JSON.stringify(location.state)}</output>; }
function follow(path: string, target: string, originState?: unknown, state?: unknown) {
  render(<MemoryRouter initialEntries={[{ pathname: path, state: originState }]}><LocalizedLink to={target} state={state}>Open</LocalizedLink><Probe /></MemoryRouter>);
  fireEvent.click(screen.getByText("Open"));
  return JSON.parse(screen.getByTestId("state").textContent || "null");
}
describe("detail origin navigation", () => {
  it("carries list origin and inherits it across related details", () => {
    expect(follow("/ko/club/g1", "/course/c1")).toEqual({ fromHub: "club" });
  });
  it("preserves explicit navigation state over the inferred origin", () => {
    expect(follow("/ko/", "/segment/s1", null, { fromHub: "explore", selection: "s1" })).toEqual({ fromHub: "explore", selection: "s1" });
  });
  it("inherits the valid origin from a detail page", () => {
    expect(follow("/ko/course/c1", "/segment/s1", { fromHub: "club" })).toEqual({ fromHub: "club" });
  });
  it.each(["/event/e1/results", "/event/e1/register", "/event/e1/host/participants", "/activity/a1/edit"])("carries the original hub into nested flow %s", target => {
    expect(follow("/ko/event/e1/results", target, { fromHub: "club" })).toEqual({ fromHub: "club" });
  });
  it("does not infer state for reserved creation flows", () => {
    expect(follow("/ko/club/g1", "/event/create")).toBeNull();
  });
  it("does not add detail state to ordinary utility links", () => {
    expect(follow("/ko/", "/settings/account")).toBeNull();
  });
  it.each(["home", "coach", "club", "explore", "community"])("accepts valid origin %s", (fromHub) => {
    expect(resolveDetailHub("/activity/a1", { fromHub })).toBe(fromHub);
  });
  it("rejects untrusted origins and uses direct entry defaults", () => {
    expect(resolveDetailHub("/course/c1", { fromHub: "settings" })).toBe("explore");
    expect(resolveDetailHub("/athlete/u1")).toBe("home");
    expect(resolveDetailHub("/event/e1")).toBe("explore");
  });
});
