import { fireEvent, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

const labels = {
  title: "작성 중인 내용이 있습니다",
  message: "이 페이지를 나가면 작성 중인 내용이 사라질 수 있습니다.",
  stayLabel: "계속 작성",
  leaveLabel: "나가기",
};

function Harness({ dirty, onLeave }: { dirty: boolean; onLeave: () => void }) {
  const { requestLeave, guardDialog } = useUnsavedChangesGuard({ dirty, ...labels });
  return (
    <>
      <button type="button" onClick={() => requestLeave(onLeave)}>leave</button>
      {guardDialog}
    </>
  );
}

describe("useUnsavedChangesGuard", () => {
  it("blocks browser unload while dirty", () => {
    renderHook(() => useUnsavedChangesGuard({ dirty: true, ...labels }));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("opens an in-app confirmation before leaving dirty forms", () => {
    const onLeave = vi.fn();
    render(<Harness dirty onLeave={onLeave} />);

    fireEvent.click(screen.getByRole("button", { name: "leave" }));

    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: labels.title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.leaveLabel }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("leaves immediately when the form is clean", () => {
    const onLeave = vi.fn();
    render(<Harness dirty={false} onLeave={onLeave} />);

    fireEvent.click(screen.getByRole("button", { name: "leave" }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
