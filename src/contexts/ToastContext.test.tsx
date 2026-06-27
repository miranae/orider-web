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

  it("initially has no toasts", () => {
    renderToast();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("adds a success toast when showToast is called", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    expect(screen.getByText("성공 메시지")).toBeInTheDocument();
  });

  it("adds an error toast with error styling", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("에러")); });
    const toast = screen.getByText("에러 메시지");
    expect(toast).toBeInTheDocument();
    expect(toast.closest("div")?.className).toContain("bg-red-600");
  });

  it("adds an info toast with info styling", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("정보")); });
    const toast = screen.getByText("정보 메시지");
    expect(toast).toBeInTheDocument();
    expect(toast.closest("div")?.className).toContain("bg-blue-600");
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

  it("can show multiple toasts simultaneously", () => {
    renderToast();
    act(() => { fireEvent.click(screen.getByText("성공")); });
    act(() => { fireEvent.click(screen.getByText("에러")); });

    expect(screen.getByText("성공 메시지")).toBeInTheDocument();
    expect(screen.getByText("에러 메시지")).toBeInTheDocument();
  });
});
