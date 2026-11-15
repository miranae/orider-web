import type { Resolve } from "../redesign";

/**
 * 세그먼트 심사 상태 칩을 만든 사람이 누르면 해소하는 곳.
 * 반려는 고쳐서 다시 만드는 화면으로, 숨김·심사 대기는 운영팀 문의 게시판으로 간다.
 * 다른 사람은 할 수 있는 게 없으므로 칩을 그대로 둔다(undefined).
 * 반려 사유는 공개 메타데이터 허용 목록에 없어 웹이 읽지 못한다(사유는 반려 알림 문구에 있다).
 */
export function segmentStatusResolve(status: string | undefined | null, isCreator: boolean): Resolve | undefined {
  if (!isCreator) return undefined;
  if (status === "rejected") return { to: "/segment/create" };
  if (status === "hidden" || status === "pending") return { to: "/community/board?type=inquiry" };
  return undefined;
}
