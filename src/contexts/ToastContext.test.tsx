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

describe("ToastContext 해결 행동", () => {
  afterEach(() => { vi.useRealTimers(); });

  function ActionConsumer({ to, onClick }: { to?: string; onClick?: () => void }) {
    const { showToast } = useToast();
    return <button onClick={() => showToast("기기 설정이 필요해요", "error", { action: { label: "기기 설정", to, onClick } })}>열기</button>;
  }

  it("라우터 안에서는 행동이 해결 화면 링크가 되고, 누르면 알림이 닫힌다", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    render(<MemoryRouter><ToastProvider><ActionConsumer to="/settings/device" /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByText("열기"));
    const link = screen.getByRole("link", { name: "기기 설정" });
    expect(link.getAttribute("href")).toContain("/settings/device");
    vi.useFakeTimers();
    fireEvent.click(link);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByText("기기 설정이 필요해요")).toBeNull();
  });

  it("언어 라우트 밖에 있어도 현재 주소의 언어(/en)를 지킨다", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    render(<MemoryRouter initialEntries={["/en/activity/a1"]}><ToastProvider><ActionConsumer to="/settings/device" /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByText("열기"));
    expect(screen.getByRole("link", { name: "기기 설정" }).getAttribute("href")).toBe("/en/settings/device");
  });

  it("onClick 행동은 버튼으로 실행되고 행동 있는 알림은 10초까지 남는다", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(<ToastProvider><ActionConsumer onClick={retry} /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByText("열기")); });
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByText("기기 설정이 필요해요")).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "기기 설정" })); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("라우터 밖에서 경로만 받은 행동은 그리지 않는다", () => {
    render(<ToastProvider><ActionConsumer to="/settings/device" /></ToastProvider>);
    fireEvent.click(screen.getByText("열기"));
    expect(screen.getByText("기기 설정이 필요해요")).toBeInTheDocument();
    expect(screen.queryByText("기기 설정")).toBeNull();
  });
});
