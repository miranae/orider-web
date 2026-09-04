import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

  it("한 명의 한국어 이름을 한 글자 폭으로 축소하지 않고 가로로 표시한다", async () => {
    const user = userEvent.setup();
    renderStack({ likers: [liker(1)] });

    await user.hover(screen.getByRole("group"));
    const tip = screen.getByRole("tooltip", { hidden: true });
    const content = tip.firstElementChild;

    expect(tip).toHaveStyle({
      width: "min(220px, calc(100vw - 16px))",
      maxWidth: "220px",
    });
    expect(content).toHaveStyle({
      width: "100%",
      maxWidth: "100%",
    });
    expect(within(tip).getByRole("link", { name: "라이더1" }).parentElement).toHaveStyle({
      whiteSpace: "nowrap",
    });
  });

  it("여러 명과 긴 이름도 220px 및 뷰포트 상한 안에서 이름별 가로 한 줄로 말줄임한다", async () => {
    const user = userEvent.setup();
    renderStack({
      likers: [
        { userId: "long", nickname: "아주아주긴라이더닉네임아주아주긴라이더닉네임" },
        liker(2),
        liker(3),
      ],
    });

    await user.hover(screen.getByRole("group"));
    const tip = screen.getByRole("tooltip", { hidden: true });
    const longName = within(tip).getByRole("link", { name: "아주아주긴라이더닉네임아주아주긴라이더닉네임" });
    const secondName = within(tip).getByRole("link", { name: "라이더2" });
    const thirdName = within(tip).getByRole("link", { name: "라이더3" });

    expect(tip).toHaveStyle({ width: "min(220px, calc(100vw - 16px))", maxWidth: "220px" });
    for (const name of [longName, secondName, thirdName]) {
      expect(name.parentElement).toHaveStyle({
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
    }
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

  it("터치 탭은 아바타 링크를 따라가지 않고 이름 목록을 연다", async () => {
    // 아바타는 모든 기기에서 링크다. 터치에서 그냥 두면 탭이 프로필 이동으로 먹혀
    // "누가 눌렀는지" 를 볼 방법이 없다 — 캡처 단계에서 이동을 막아야 한다.
    // 기기 종류가 아니라 실제 입력으로 갈라야 트랙패드 붙인 태블릿·터치 노트북도 동작한다.
    const user = userEvent.setup();
    renderStack();
    const avatarLink = screen.getAllByRole("link")[0];

    await user.pointer({ keys: "[TouchA]", target: avatarLink });

    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    // 이동이 막혔는지 — 라우터가 그대로면 아바타 링크가 계속 문서에 있다.
    expect(screen.getAllByRole("link")[0]).toBeInTheDocument();
  });

  it("툴팁 안 이름을 터치하면 실제로 프로필로 이동한다", async () => {
    // href 만 보면 안 된다 — 래퍼의 캡처 핸들러가 툴팁 안 링크까지 preventDefault 하면
    // 터치 사용자는 프로필로 갈 방법이 아예 없어진다(회귀로 실제 발생).
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/ko"]}>
        <Routes>
          <Route path="/ko" element={<LikersAvatarStack likers={[liker(1), liker(2)]} />} />
          <Route path="/ko/athlete/:id" element={<div>프로필 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("group") });
    const tip = screen.getByRole("tooltip", { hidden: true });
    await user.pointer({ keys: "[TouchA]", target: within(tip).getByRole("link", { name: "라이더1" }) });

    expect(await screen.findByText("프로필 화면")).toBeInTheDocument();
  });

  it("선행 포인터 없이 합성된 클릭(스크린리더·스위치 제어)은 프로필로 이동한다", async () => {
    // 터치 판정 표식이 남아 있으면 합성 클릭을 터치로 오인해 이동을 막는다 —
    // 접근성 사용자에겐 아바타가 유일한 직접 프로필 경로다.
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/ko"]}>
        <Routes>
          <Route path="/ko" element={<LikersAvatarStack likers={[liker(1), liker(2)]} />} />
          <Route path="/ko/athlete/:id" element={<div>프로필 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // 먼저 터치로 한 번 눌러 표식을 남긴다.
    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("group") });
    // 이어서 pointerdown 없이 click 만 합성 — 이동해야 한다.
    fireEvent.click(screen.getAllByRole("link")[0]);

    expect(await screen.findByText("프로필 화면")).toBeInTheDocument();
  });

  it("스크롤로 제스처가 취소된 뒤의 합성 클릭도 프로필로 이동한다", async () => {
    // 취소되면 click 이 오지 않아 판정이 표식을 풀 기회가 없다 — 여기서 안 되돌리면
    // 이후 합성 클릭이 터치로 오인된다.
    render(
      <MemoryRouter initialEntries={["/ko"]}>
        <Routes>
          <Route path="/ko" element={<LikersAvatarStack likers={[liker(1), liker(2)]} />} />
          <Route path="/ko/athlete/:id" element={<div>프로필 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getAllByRole("link")[0];

    fireEvent.pointerDown(link, { pointerType: "touch" });
    fireEvent.pointerCancel(link, { pointerType: "touch" }); // 스크롤로 취소
    fireEvent.click(link);

    expect(await screen.findByText("프로필 화면")).toBeInTheDocument();
  });

  it("터치로 연 뒤에도 키보드 포커스로 목록을 열 수 있다", async () => {
    // 캡처에서 전파를 끊으면 버블 onClick 이 안 돌아 포인터-포커스 표식이 남는다.
    // 그러면 이후 Tab 포커스가 툴팁을 못 여는 회귀가 생긴다.
    const user = userEvent.setup();
    renderStack();
    const group = screen.getByRole("group");

    await user.pointer({ keys: "[TouchA]", target: group });
    await user.pointer({ keys: "[TouchA]", target: group }); // 닫기
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
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
