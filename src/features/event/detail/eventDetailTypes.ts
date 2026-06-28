interface CourseInfo {
  name: string;
  gpxUrl: string;
  storagePath: string;
}

export interface EventDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  startTime: number;
  creatorId: string;
  groupId?: string;
  maxParticipants?: number;
  courseGpx?: string;
  courses?: CourseInfo[];
  courseIds?: string[];
  description?: string;
  region?: string;
  creatorName?: string;
  categories?: Array<{ id: string; name: string; capacity?: number }>;
  entryFee?: number;
  cutoffMs?: number;
  bibStartTime?: string;
}

export interface RecentParticipant {
  uid: string;
  nickname: string;
  category: string | null;
  joinedAt: number;
}
