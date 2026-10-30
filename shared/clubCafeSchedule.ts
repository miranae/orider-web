/** Public Naver board metadata only; comments are never attendance counts. */
export interface CafeScheduleEntry {
  id: string;
  title: string;
  dates: string[];
  boardId: number;
  boardName: string;
  author: string;
  commentCount: number | null;
  url: string;
  closed: boolean;
  cancelled: boolean;
}
export interface ClubCafeSchedule {
  source: "naver-cafe";
  cafeUrl: string;
  syncedAt: number;
  entries: CafeScheduleEntry[];
  undatedCount: number;
  truncated: boolean;
}
