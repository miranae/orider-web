import { createContext, useContext } from "react";

/**
 * 코치 분석은 차트·수치·상태만 두고 계산 방법·조회 범위·해석 주의 같은 설명 문구를 뺀다.
 * 같은 패널을 쓰는 활동 상세·컨디션은 이 값을 주지 않으므로 설명을 그대로 보여준다.
 */
export const ConciseExplanationsContext = createContext(false);
export const useConciseExplanations = () => useContext(ConciseExplanationsContext);
