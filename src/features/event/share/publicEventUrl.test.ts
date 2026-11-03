import { describe, expect, it } from "vitest";
import { publicEventUrl } from "./publicEventUrl";

describe("이벤트 공유 주소", () => {
  it.each(["ko", "en"])("%s 임베드 주소는 일반 웹 주소로 내보내고 인증 정보를 버린다", lang => {
    const current = `https://orider.co.kr/${lang}/embed/event/event-1/results?contractVersion=1#handoff=secret`;
    expect(publicEventUrl(current, "event-1")).toBe(`https://orider.co.kr/${lang}/event/event-1`);
    expect(publicEventUrl(current, "event-1", true)).toBe(`https://orider.co.kr/${lang}/event/event-1/results`);
  });
  it("일반 웹도 정본 이벤트 주소를 공유한다", () => {
    expect(publicEventUrl("https://orider.co.kr/ko/event/old?tracking=1#top", "행사/1"))
      .toBe("https://orider.co.kr/ko/event/%ED%96%89%EC%82%AC%2F1");
  });
});
