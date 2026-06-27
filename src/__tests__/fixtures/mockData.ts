import type {
  Activity,
  ActivitySummary,
  ActivityStreams,
  UserProfile,
  Kudos,
  Comment,
  Notification,
  FriendRelation,
  FriendRequest,
  Segment,
} from "@shared/types";

// ─── ActivitySummary ──────────────────────────────────────
export function createMockSummary(overrides?: Partial<ActivitySummary>): ActivitySummary {
  return {
    distance: 42000,
    ridingTimeMillis: 5400000,
    averageSpeed: 28.0,
    maxSpeed: 45.2,
    averageCadence: 85,
    maxCadence: 110,
    averageHeartRate: 145,
    maxHeartRate: 178,
    averagePower: 200,
    maxPower: 450,
    normalizedPower: 215,
    elevationGain: 320,
    calories: 850,
    relativeEffort: 120,
    ...overrides,
  };
}

// ─── Activity ─────────────────────────────────────────────
let activitySeq = 0;
export function createMockActivity(overrides?: Partial<Activity>): Activity {
  const id = `act-${++activitySeq}`;
  return {
    id,
    userId: "user-1",
    nickname: "테스트 라이더",
    profileImage: null,
    type: "ride",
    createdAt: Date.now() - 3600000,
    startTime: Date.now() - 7200000,
    endTime: Date.now() - 3600000,
    summary: createMockSummary(),
    thumbnailTrack: "mock-polyline",
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 3,
    commentCount: 1,
    segmentEffortCount: 2,
    description: "한강 라이딩",
    visibility: "everyone",
    gpxPath: null,
    ...overrides,
  };
}

// ─── ActivityStreams ───────────────────────────────────────
export function createMockStreams(overrides?: Partial<ActivityStreams>): ActivityStreams {
  return {
    userId: "user-1",
    latlng: [[37.5, 127.0], [37.51, 127.01]],
    altitude: [10, 15],
    heartrate: [140, 150],
    watts: [200, 220],
    cadence: [85, 90],
    velocity_smooth: [7.5, 8.0],
    time: [0, 60],
    distance: [0, 450],
    ...overrides,
  };
}

// ─── UserProfile ──────────────────────────────────────────
export function createMockProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    nickname: "테스트 유저",
    email: "test@example.com",
    photoURL: null,
    stravaConnected: false,
    stravaAthleteId: null,
    stravaNickname: null,
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

export function createMockStravaProfile(overrides?: Partial<UserProfile>): UserProfile {
  return createMockProfile({
    stravaConnected: true,
    stravaAthleteId: 12345678,
    stravaNickname: "StravaRider",
    ...overrides,
  });
}

// ─── Kudos ────────────────────────────────────────────────
export function createMockKudos(overrides?: Partial<Kudos>): Kudos {
  return {
    userId: "user-2",
    nickname: "좋아요 유저",
    profileImage: null,
    createdAt: Date.now() - 1800000,
    ...overrides,
  };
}

// ─── Comment ──────────────────────────────────────────────
let commentSeq = 0;
export function createMockComment(overrides?: Partial<Comment>): Comment {
  return {
    id: `comment-${++commentSeq}`,
    userId: "user-2",
    nickname: "댓글 유저",
    profileImage: null,
    text: "좋은 라이딩이네요!",
    createdAt: Date.now() - 1200000,
    ...overrides,
  };
}

// ─── Notification ─────────────────────────────────────────
let notifSeq = 0;
export function createMockNotification(overrides?: Partial<Notification>): Notification {
  return {
    id: `notif-${++notifSeq}`,
    type: "kudos",
    fromUserId: "user-2",
    fromNickname: "알림 유저",
    fromProfileImage: null,
    activityId: "act-1",
    segmentId: null,
    message: "알림 유저님이 좋아요를 보냈습니다",
    read: false,
    createdAt: Date.now() - 600000,
    ...overrides,
  };
}

// ─── FriendRelation ───────────────────────────────────────
export function createMockFriend(overrides?: Partial<FriendRelation>): FriendRelation {
  return {
    userId: "friend-1",
    nickname: "친구 유저",
    profileImage: null,
    friendCode: "ABC123",
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

// ─── FriendRequest ────────────────────────────────────────
export function createMockFriendRequest(overrides?: Partial<FriendRequest>): FriendRequest {
  return {
    requesterId: "requester-1",
    nickname: "요청 유저",
    profileImage: null,
    createdAt: Date.now() - 3600000,
    ...overrides,
  };
}

// ─── Segment ──────────────────────────────────────────────
export function createMockSegment(overrides?: Partial<Segment>): Segment {
  return {
    id: "seg-1",
    name: "남산 업힐",
    description: "남산 정상까지 업힐 구간",
    creatorId: "user-1",
    source: "official",
    status: "active",
    startLat: 37.549,
    startLon: 126.99,
    endLat: 37.551,
    endLon: 126.992,
    polyline: "mock-segment-polyline",
    distance: 2500,
    elevationGain: 180,
    averageGrade: 7.2,
    geoHash: "wydm9",
    category: "climb",
    climbCategory: "3",
    totalEfforts: 150,
    starCount: 42,
    kom: {
      time: 420000,
      userId: "user-3",
      nickname: "KOM 라이더",
      recordedAt: Date.now() - 2592000000,
    },
    qom: null,
    ...overrides,
  };
}
