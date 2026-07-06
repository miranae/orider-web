export type BoardReportReason = "spam" | "abuse" | "privacy" | "illegal" | "other";

export type BoardReportTargetType = "post" | "comment";

export interface BoardReportPreview {
  title: string;
  authorNickname: string;
  createdAt: number;
}

export interface BoardReportPayload {
  targetType: BoardReportTargetType;
  postId: string;
  commentId?: string;
  reason: BoardReportReason;
  note: string;
  targetPreview: BoardReportPreview;
}

export function buildBoardReportPayload(args: BoardReportPayload): BoardReportPayload {
  return {
    targetType: args.targetType,
    postId: args.postId,
    ...(args.commentId ? { commentId: args.commentId } : {}),
    reason: args.reason,
    note: args.note.trim(),
    targetPreview: {
      title: args.targetPreview.title,
      authorNickname: args.targetPreview.authorNickname,
      createdAt: args.targetPreview.createdAt,
    },
  };
}
