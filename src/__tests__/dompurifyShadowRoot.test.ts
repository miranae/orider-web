import DOMPurify from "dompurify";
import { describe, expect, it } from "vitest";

/** GHSA-cg2g-xh64-v4q7: 표현식을 실행하지 않고 shadow-root 정화 결과만 확인한다. */
describe("DOMPurify shadow-root template safety", () => {
  it.each(["${7*7}", "{{7*7}}", "<%7*7%>"])("removes a split template expression after forbidden-node removal: %s", expression => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    for (const character of expression) {
      shadow.append(document.createTextNode(character), document.createElement("object"));
    }
    DOMPurify.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true });
    shadow.normalize();
    expect(shadow.textContent).not.toContain(expression);
    expect(shadow.querySelector("object")).toBeNull();
  });
});
