import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { FOCUS_TARGET_TIMEOUT_MS, useFocusTarget } from "./useFocusTarget";

function Host({ children }: { children: React.ReactNode }) {
  useFocusTarget();
  return <>{children}</>;
}

function LateField() {
  const [loaded, setLoaded] = useState(false);
  return <>
    <button onClick={() => setLoaded(true)}>load</button>
    <fieldset disabled={!loaded}><details><summary>more</summary><input aria-label="FTP" data-focus-target="ftp" /></details></fieldset>
  </>;
}

describe("useFocusTarget", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("?focus 칸이 잠겨 있으면 풀리는 즉시 접힌 칸을 펼치고 초점을 둔다", async () => {
    render(<MemoryRouter initialEntries={["/settings/training?sport=bike&focus=ftp"]}><Host><LateField /></Host></MemoryRouter>);
    const input = screen.getByLabelText("FTP");
    expect(document.activeElement).not.toBe(input);
    // 사용자 입력 감지는 pointerdown/keydown 뿐 — 로딩 완료는 프로그램 상태 변경으로 흉내 낸다.
    await act(async () => { screen.getByText("load").click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(input);
    expect(input.closest("details")!.open).toBe(true);
  });

  it("focus 쿼리가 없으면 아무것도 건드리지 않는다", () => {
    render(<MemoryRouter initialEntries={["/settings/training"]}><Host><input aria-label="FTP" data-focus-target="ftp" /></Host></MemoryRouter>);
    expect(document.activeElement).not.toBe(screen.getByLabelText("FTP"));
  });

  it("사용자가 먼저 조작하면 늦게 나타난 칸으로 끌어오지 않는다", async () => {
    render(<MemoryRouter initialEntries={["/x?focus=ftp"]}><Host><LateField /></Host></MemoryRouter>);
    const button = screen.getByText("load");
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button.click();
    });
    expect(document.activeElement).not.toBe(screen.getByLabelText("FTP"));
  });

  it("시한을 넘기면 지켜보기를 멈춘다", () => {
    vi.useFakeTimers();
    const { container } = render(<MemoryRouter initialEntries={["/x?focus=ftp"]}><Host><div /></Host></MemoryRouter>);
    act(() => { vi.advanceTimersByTime(FOCUS_TARGET_TIMEOUT_MS + 1); });
    container.insertAdjacentHTML("beforeend", `<input data-focus-target="ftp">`);
    expect(document.activeElement?.getAttribute("data-focus-target")).not.toBe("ftp");
  });
});
