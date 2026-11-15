import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext";

function TestConsumer() {
  const { toasts, showToast } = useToast();
  return (
    <div>
      <div data-testid="count">{toasts.length}</div>
      <button onClick={() => showToast("성공 메시지", "success")}>성공</button>
      <button onClick={() => showToast("에러 메시지", "error")}>에러</button>
      <button onClick={() => showToast("정보 메시지", "info")}>정보</button>
    </div>
  );
}

function renderToast() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );
}

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a success toast when showToast is called", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    expect(screen.getByText("성공 메시지")).toBeInTheDocument();
  });

  it("auto-removes toast after 2.5s + 200ms animation", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    expect(screen.getByText("성공 메시지")).toBeInTheDocument();

    // After 2500ms, toast enters removing state
    act(() => { vi.advanceTimersByTime(2500); });

    // After another 200ms, toast is fully removed
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.queryByText("성공 메시지")).not.toBeInTheDocument();
  });

  it("언마운트하면 대기 중인 자동 닫기 타이머를 모두 정리한다", () => {
    const { unmount } = renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    act(() => { fireEvent.click(screen.getByText("에러")); });
    // 성공 토스트를 닫는 중(200ms 제거 타이머)까지 걸어 둔다.
    act(() => { vi.advanceTimersByTime(2500); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("can show multiple toasts simultaneously", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    act(() => { fireEvent.click(screen.getByText("에러")); });

    expect(screen.getByText("성공 메시지")).toBeInTheDocument();
    expect(screen.getByText("에러 메시지")).toBeInTheDocument();
  });
});

describe("ToastContext 누르면 해결", () => {
  afterEach(() => { vi.useRealTimers(); });

  function ResolveConsumer({ to, onClick }: { to?: string; onClick?: () => void }) {
    const { showToast } = useToast();
    return <button onClick={() => showToast("기기 설정이 필요해요", "error", { resolve: { to, onClick } })}>열기</button>;
  }

  it("알림 문구 자체가 해결 화면 링크가 되고, 누르면 알림이 닫힌다 — 버튼을 덧붙이지 않는다", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    render(<MemoryRouter><ToastProvider><ResolveConsumer to="/settings/device" /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByText("열기"));
    const link = screen.getByRole("link", { name: "기기 설정이 필요해요" });
    expect(link.getAttribute("href")).toContain("/settings/device");
    // 닫기(×) 말고 새 버튼이 생기지 않는다.
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["열기", "닫기"]);
    vi.useFakeTimers();
    fireEvent.click(link);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByText("기기 설정이 필요해요")).toBeNull();
  });

  it("언어 라우트 밖에 있어도 현재 주소의 언어(/en)를 지킨다", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    render(<MemoryRouter initialEntries={["/en/activity/a1"]}><ToastProvider><ResolveConsumer to="/settings/device" /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByText("열기"));
    expect(screen.getByRole("link", { name: "기기 설정이 필요해요" }).getAttribute("href")).toBe("/en/settings/device");
  });

  it("onClick 해결은 문구를 눌러 실행되고 누를 수 있는 알림은 10초까지 남는다", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(<ToastProvider><ResolveConsumer onClick={retry} /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByText("열기")); });
    act(() => { vi.advanceTimersByTime(9000); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "기기 설정이 필요해요" })); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("라우터 밖에서 경로만 받은 알림은 글자로만 보인다", () => {
    render(<ToastProvider><ResolveConsumer to="/settings/device" /></ToastProvider>);
    fireEvent.click(screen.getByText("열기"));
    expect(screen.getByText("기기 설정이 필요해요").tagName).toBe("SPAN");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
