import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Resolvable } from "../redesign";
import { segmentStatusResolve } from "./segmentStatusResolve";

function chip(status: string, isCreator: boolean) {
  return render(
    <MemoryRouter>
      <Resolvable resolve={segmentStatusResolve(status, isCreator)}><span>상태 칩</span></Resolvable>
    </MemoryRouter>,
  );
}

describe("세그먼트 심사 상태 칩 — 만든 사람이 누르면 해소하는 곳으로", () => {
  it.each([
    ["rejected", "/segment/create"],
    ["hidden", "/community/board?type=inquiry"],
    ["pending", "/community/board?type=inquiry"],
  ])("%s 칩은 만든 사람에게 칩 자체가 %s 링크가 된다", (status, href) => {
    chip(status, true);
    expect(screen.getByRole("link", { name: "상태 칩" }).getAttribute("href")).toContain(href);
    // 설명을 펼치거나 새 버튼을 붙이지 않는다.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("다른 사람에게는 칩을 그대로 둔다", () => {
    chip("rejected", false);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByText("상태 칩"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("승인된 세그먼트 칩은 누를 일이 없다", () => {
    expect(segmentStatusResolve("active", true)).toBeUndefined();
  });
});
