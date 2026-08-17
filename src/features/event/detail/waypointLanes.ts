/**
 * 이벤트 상세용 웨이포인트 레인 재노출.
 *
 * 구현은 코스엔진(`features/courseEngine/waypointLanes.ts`)으로 옮겼다. 이전에는 이 파일의
 * `classifyLane` 과 `EventDetailPage` 안의 인라인 분류기가 서로 다른 문자열을 봐서(`"KOM"` 대
 * `"콤"`) 같은 지점이 표와 차트에서 다르게 분류될 수 있었다. 이제 양쪽이 같은 함수를 쓴다.
 * 새 코드는 이 파일 대신 `features/courseEngine` 를 직접 쓸 것.
 */

export {
  classifyLane,
  isProfileMarkerLane,
  LANE_DEFS,
  LANE_ORDER,
  type WpLane,
} from "../../courseEngine";
