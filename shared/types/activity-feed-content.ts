/** Published, bounded card content; Activity.description remains the title. */
export interface ActivityFeedContentProjection {
  version: 1;
  sourceRevision: string;
  revision: string;
  memo: string | null;
  memoTruncated: boolean;
  photos: Array<{ id: string; url: string; caption: string | null; kind?: "video"; videoUrl?: string; durationSeconds?: number }>;
  totalPhotoCount: number;
  /** False means a bounded scan lower bound, not an exact total. */
  totalPhotoCountExact?: boolean;
}
export interface ActivityFeedComment {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  text: string;
  createdAt: number;
}
export interface ActivityFeedContent extends ActivityFeedContentProjection {
  activityId: string;
  status: "ready" | "pending";
  comments: ActivityFeedComment[];
}
