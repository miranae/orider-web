import { describe, expect, it } from "vitest";
import ko from "../../i18n/resources/ko/training.json";
import en from "../../i18n/resources/en/training.json";

/**
 * 서버는 **질문 문구로** 프로그레스 플래너 경로를 고른다
 * (orider-g1-web: `isProgressPlannerQuestion`). 카드가 채워 주는 시작 질문이 그 규칙에 걸리지
 * 않으면 버튼이 조용히 무의미해진다 — 사용자는 코치에게 물어봤는데 체크인 폼이 안 나온다.
 *
 * 규칙을 여기 복제해 두고 문구를 검사한다. 서버 규칙이 바뀌면 이 테스트가 먼저 깨져야 한다.
 */
const PROGRESS_PLANNER_QUESTION =
  /(?:다음\s*(?:7일|일주일|주).*(?:운동|훈련|계획|조정)|디로드|회복\s*(?:계획|주간)|훈련.*(?:계획\s*조정|조정안|처방)|운동.*(?:계획\s*조정|조정안|처방)|이번\s*주\s*계획에서\s*가장\s*중요한\s*운동|최근\s*수행\s*결과\s*때문에\s*바뀐\s*부분|(?:seven|7)[ -]?day.*(?:plan|training)|\bdeload\b|training prescription)/u;

const routes = (question: string) => PROGRESS_PLANNER_QUESTION.test(question.normalize("NFKC").toLowerCase());

describe("주간 체크인 시작 질문", () => {
  it("한국어 문구가 서버의 플래너 경로로 라우팅된다", () => {
    expect(routes(ko["decision.checkIn.question"])).toBe(true);
  });

  it("영어 문구가 서버의 플래너 경로로 라우팅된다", () => {
    expect(routes(en["decision.checkIn.question"])).toBe(true);
  });

  it("규칙에 안 걸리는 문구는 걸러낸다 — 검사가 무조건 참이 아니다", () => {
    expect(routes("오늘 뭐 타면 좋을까?")).toBe(false);
    expect(routes("what should I ride today?")).toBe(false);
  });
});
