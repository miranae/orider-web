import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FirstSyncCelebration from "./FirstSyncCelebration";

function setup(activityId: string | null = "act-1") {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <FirstSyncCelebration activityId={activityId} onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

describe("FirstSyncCelebration", () => {
  it("모달 접근성 속성을 갖추고 제목과 연결된다", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(labelledBy!)).toHaveTextContent("첫 러닝이 도착했어요!");
  });

  it("해석 화면으로 가는 CTA 가 활동을 가리킨다 (aha moment 로 유도)", () => {
    setup("act-42");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining("/activity/act-42"));
  });

  it("활동 id 가 없으면 CTA 를 숨기고 닫기만 남긴다", () => {
    setup(null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("ESC 로 닫힌다", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("스크림 클릭은 닫고, 패널 내부 클릭은 닫지 않는다", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("첫 포커스가 모달 안으로 들어간다", () => {
    setup();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});
