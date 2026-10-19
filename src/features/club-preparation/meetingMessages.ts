/** 서버 상세/개인정보를 오류 문구로 노출하지 않는다. */
export function meetingErrorMessage(error: unknown, english = false): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (error instanceof Error && error.message === "club-meeting/payload-limit")
    return english
      ? "This course is too large. Choose fewer segments or a smaller GPX file. Your draft is preserved."
      : "코스 데이터가 너무 커요. 구간 수를 줄이거나 더 작은 GPX를 사용해주세요. 초안은 보관했습니다.";
  if (code.includes("permission-denied") || code.includes("unauthenticated"))
    return english
      ? "Your club membership or sign-in could not be confirmed."
      : "로그인 또는 현재 클럽 회원 자격을 확인하지 못했어요.";
  if (code.includes("failed-precondition") || code.includes("aborted"))
    return english
      ? "The meeting changed. Reload the latest information before trying again. Your draft is preserved."
      : "모임 상태가 달라졌어요. 최신 내용을 확인한 후 다시 시도해주세요. 초안은 보관했습니다.";
  return english
    ? "Could not save or refresh. Please try again; your draft is preserved."
    : "저장 또는 최신 상태 확인에 실패했어요. 다시 시도해주세요. 작성 중인 초안은 보관했습니다.";
}
