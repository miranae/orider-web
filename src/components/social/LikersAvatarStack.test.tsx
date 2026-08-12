import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LikersAvatarStack from "./LikersAvatarStack";

function liker(n: number) {
  return { userId: `u${n}`, nickname: `라이더${n}`, profileImage: null };
}

function renderStack(props: Partial<React.ComponentProps<typeof LikersAvatarStack>> = {}) {
  return render(
    <MemoryRouter>
      <LikersAvatarStack likers={[liker(1), liker(2)]} {...props} />
    </MemoryRouter>,
  );
}

describe("LikersAvatarStack", () => {
  it("좋아요 누른 사람이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = renderStack({ likers: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("누른 사람 이름을 스크린리더용 라벨로 한 번에 노출한다", () => {
    renderStack();
    expect(screen.getByRole("group")).toHaveAccessibleName("좋아요 2명: 라이더1, 라이더2");
  });

  it("max 를 넘는 인원은 +N 으로 접는다", () => {
    renderStack({ likers: [liker(1), liker(2), liker(3)], max: 2 });
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("목록에 없는 인원까지 totalCount 로 세어 +N 에 반영한다", () => {
    // 피드 카드의 recentKudos 는 상위 N 명만 내려온다 — 나머지는 이름 없이 카운트로만.
    renderStack({ likers: [liker(1), liker(2)], totalCount: 7, max: 5 });
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("hover 하면 누른 사람 이름 툴팁이 뜨고, 벗어나면 사라진다", async () => {
    const user = userEvent.setup();
    renderStack();
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

    await user.hover(screen.getByRole("group"));
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toHaveTextContent("라이더1");
    expect(tip).toHaveTextContent("라이더2");

    await user.unhover(screen.getByRole("group"));
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("터치로 탭하면 툴팁이 열리고, 다시 탭하면 닫힌다", async () => {
    // hover 가 없는 터치에서도 열려야 한다. pointerenter→click 이 연달아 오므로
    // 토글이 상쇄돼 열리지 않던 회귀를 막는다.
    const user = userEvent.setup();
    renderStack();
    const group = screen.getByRole("group");

    await user.pointer({ keys: "[TouchA]", target: group });
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

    await user.pointer({ keys: "[TouchA]", target: group });
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("마우스 클릭은 hover 로 열린 툴팁을 닫지 않는다", async () => {
    const user = userEvent.setup();
    renderStack();
    await user.click(screen.getByRole("group"));
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
  });

  it("이름을 모르는 나머지 인원은 툴팁에 '외 N명' 으로만 적는다", async () => {
    const user = userEvent.setup();
    renderStack({ likers: [liker(1)], totalCount: 4 });
    await user.hover(screen.getByRole("group"));
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("외 3명");
  });
});
