// ── ActivityType ────────────────────────────────────────────────────
/** Strava 및 Orider 내부에서 사용하는 활동 종목 문자열. Activity.type은 하위 호환을 위해 string 유지. */
export type ActivityType = 'Ride' | 'Run' | 'Swim' | 'Walk' | 'Hike' | 'VirtualRide' | 'VirtualRun' | 'cycling' | 'running' | 'swimming' | 'transition' | 'brick';

// ── Activity ────────────────────────────────────────────────────────
export interface Activity {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  type: string; // TODO: ActivityType으로 전환 (Strava 호환성 확인 후)
  createdAt: number;
  startTime: number;
  endTime: number;
  summary: ActivitySummary;
  thumbnailTrack: string; // encoded polyline
  mapImageUrl?: string | null;
  groupId: string | null;
  groupRideId: string | null;
  photoCount: number;
  kudosCount: number;
  commentCount: number;
  /** 피드 카드용 사전 집계 — kudos 추가/제거 시 서버(onKudos*)가 최신순 상위 N명을 비정규화.
   *  카드가 좋아요 아바타를 추가 read 없이(0 read) 표시하기 위함 (스트라바 방식). */
  recentKudos?: Array<{ userId: string; nickname: string; profileImage: string | null }>;
  /** 피드 카드용 AI 요약 미리보기(한국어) — getActivityNarrative 생성 시 summary 를 활동 doc 에 비정규화.
   *  온디맨드 생성이라 대부분 활동엔 없음(undefined) — 있을 때만 카드에 노출. */
  aiSummaryPreview?: string | null;
  /** 영어 슬롯 미리보기 — EN 로케일로 분석을 생성했을 때만 채워짐(lazy). 없으면 ko 로 폴백. */
  aiSummaryPreview_en?: string | null;
  segmentEffortCount: number;
  /** 피드 카드용 사전 집계 — 매칭 후 서버가 작성. 최대 3개, 우선순위 KOM > PR > 2nd > 3rd. */
  topAchievements?: Array<{
    type: 'KOM' | 'PR' | '2nd' | '3rd';
    segmentId: string;
    segmentName: string;
    time: string; // "M:SS"
  }>;
  description: string;
  visibility: 'everyone' | 'friends' | 'private';
  gpxPath: string | null;
  deletedAt?: number | null;
  source?: 'strava' | 'orider' | 'apple_health' | 'health_connect';
  stravaActivityId?: number;
  /** 외부 소스의 원본 ID. health-source (Apple Health / Health Connect) 활동에서 사용. */
  externalId?: string;
  /**
   * 활동 지문 (Stage 3 dedup 용). `${startTime}_${distance}_${sport}` 같은 합성 키를 해시.
   * 같은 운동이 여러 소스(Strava + Apple Health)에 있을 때 fingerprint 가 일치한다.
   * Stage 1 에서는 기록만 — 실제 dedup 은 Stage 3.
   */
  fingerprint?: string;
  /** 외부 소스의 부가 메타 (워치 모델, 원본 앱 패키지 등) */
  sourceMeta?: {
    deviceModel?: string;
    originPackage?: string;
  };
  weather?: {
    temperature?: number;     // °C
    feelsLike?: number;       // 체감 °C
    windSpeed?: number;       // m/s
    windDirection?: number;   // degrees (0-360)
    humidity?: number;        // %
    precipitation?: number;   // mm
    weatherCode?: number;     // WMO weather code
    airQuality?: string;      // 좋음/보통/나쁨
  };
  gear?: {
    name: string;             // "Nike Vaporfly 3"
    type: string;             // "shoes" | "bike" | "watch"
    totalDistanceKm: number;  // 누적 거리
    maxDistanceKm?: number;   // 교체 권장 거리
  };
  isVirtualPower?: boolean;
  virtualPowerParams?: {
    riderWeightKg: number;
    bikeWeightKg: number;
    rollingResistance: number;
    cdA: number;
    profileId: string;
    calculatedAt: number;
  };
  // 가상파워 또는 분석 트리거가 활동 문서 top-level에 채워주는 파워 메트릭.
  // summary.* 가 비었을 때 UI fallback으로 사용.
  avgPower?: number | null;
  weightedAvgPower?: number | null;
  intensityFactor?: number | null;
  ftp?: number;
}

export interface ActivitySummary {
  distance: number; // meters
  ridingTimeMillis: number; // 경과 시간(elapsed) — orider 활동은 정지 포함
  // #236: activity_metrics 에서 비정규화된 이동/정지 시간 (정지 제외 movingTime, durationSec - moving).
  // 피드 카드(ActivityCard/MobileFeedPage)가 per-card metrics 구독 없이 이동시간을 표시하게 하는 용도.
  // 상세 페이지와 동일 소스(activity_metrics)라 값 일치 보장. streams/metrics 없는 활동은 undefined.
  movingTimeSec?: number;
  pauseTimeSec?: number;
  averageSpeed: number; // km/h
  maxSpeed: number; // km/h
  averageCadence: number | null;
  maxCadence: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averagePower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  elevationGain: number; // meters
  calories: number | null;
  relativeEffort: number | null; // TRIMP
  tss: number | null; // Training Stress Score (bike TSS / run rTSS / swim sTSS)
  swolf: number | null; // 수영 SWOLF (시간+스트로크)
}

// ── Activity Photo ───────────────────────────────────────────────────
export interface ActivityPhoto {
  id: string;
  storagePath: string;
  thumbnailPath: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  caption: string | null;
}

// ── Social ──────────────────────────────────────────────────────────
export interface Kudos {
  userId: string;
  nickname: string;
  profileImage: string | null;
  createdAt: number;
}

export interface Comment {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  text: string;
  createdAt: number;
  deletedAt?: number | null;
}

export interface Notification {
  id: string;
  type: 'kudos' | 'comment' | 'follow' | 'friend_request' | 'friend_accept' | 'group_invite' | 'kom' | 'segment_approved' | 'segment_rejected';
  fromUserId: string;
  fromNickname: string;
  fromProfileImage: string | null;
  activityId: string | null;
  segmentId: string | null;
  message: string;
  read: boolean;
  createdAt: number;
}

// ── Segment ──────────────────────────────────────────────────────────
export interface Segment {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  source: 'official' | 'user' | 'strava' | 'auto';
  status: 'active' | 'pending' | 'hidden' | 'rejected';
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  polyline: string; // encoded polyline
  distance: number; // meters
  elevationGain: number;
  averageGrade: number; // percent
  geoHash: string;
  category: 'climb' | 'sprint' | 'flat';
  climbCategory: number; // 0=NC, 1=Cat4, 2=Cat3, 3=Cat2, 4=Cat1, 5=HC
  totalEfforts: number;
  starCount: number;
  kom: SegmentRecord | null;
  qom: SegmentRecord | null;
  createdByUid: string | null;
  createdFromActivityId: string | null;
  geoHashStart: string | null;
  geoHashEnd: string | null;
  moderation: SegmentModeration | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface SegmentModeration {
  reviewedByUid: string;
  reviewedAt: number;
  action: 'approve' | 'reject' | 'hide';
  reason: string | null;
}

export interface CreateSegmentProposalRequest {
  activityId: string;
  startIndex: number;
  endIndex: number;
  name: string;
  description: string;
  category: 'climb' | 'sprint' | 'flat';
}

export interface SegmentRecord {
  time: number; // ms
  userId: string;
  nickname: string;
  recordedAt: number;
}

export interface SegmentEffort {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  activityId: string;
  elapsedTime: number; // ms
  averageSpeed: number;
  averageHeartRate: number | null;
  averagePower: number | null;
  averageCadence: number | null;
  recordedAt: number;
  rank: number | null;
}

export interface UserPR {
  bestTime: number;
  secondBest: number | null;
  thirdBest: number | null;
  bestEffortId: string;
  secondEffortId: string | null;
  thirdEffortId: string | null;
  totalEfforts: number;
  lastEffortAt: number;
}

// ── Group ────────────────────────────────────────────────────────────
export type GroupKind = 'club' | 'running_crew' | 'tri_team' | 'corporate';
export type GroupApproval = 'auto' | 'manual';

export interface GroupToggles {
  postEvents: boolean;       // 그룹 이벤트를 개인 캘린더에 구독
  membersPost: boolean;       // 멤버가 그룹 피드에 글쓰기 가능
  showInDirectory: boolean;   // 검색·디렉터리 노출
  notifyMembers: boolean;     // 그룹 공지 푸시
  ridePhotos: boolean;        // 자동 라이드 사진 공유
}

export interface Group {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  createdAt: number;
  isActive: boolean;
  inviteCode: string;
  visibility: 'public' | 'private';
  /** 그룹 주 종목 (단일, 후방 호환) — sports[] 보유 시 무시 가능 */
  discipline?: 'bike' | 'run' | 'swim' | 'tri';
  /** 멀티 종목 (시안 group-create.html 기준) */
  sports?: ('bike' | 'run' | 'swim' | 'tri')[];
  /** 동호회 / 러닝크루 / 트라이애슬론 / 회사 동호회 */
  kind?: GroupKind;
  /** "서울 · 잠실" 형태 활동 지역 */
  city?: string;
  /** 3자 이내 그룹 배지 (자동 fallback: 이름 앞 글자) */
  badge?: string;
  /** 가입 승인 방식 */
  approval?: GroupApproval;
  /** 그룹 규칙 (마크다운 가능) */
  rules?: string;
  /** 운영 토글 */
  toggles?: Partial<GroupToggles>;
  memberCount: number;
}

export type GroupMemberRole = 'leader' | 'co-leader' | 'member';

export interface GroupMember {
  userId: string;
  joinedAt: number;
  status: string;
  /** 시안: leader / co-leader / member */
  role?: GroupMemberRole;
}

/** 그룹 내부 랭킹 메트릭 */
export type GroupLeaderboardMetric = 'ftp_per_kg' | 'weekly_wtss';

export interface GroupLeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  photoURL?: string | null;
  ftp?: number | null;
  weightKg?: number | null;
  ftpPerKg?: number | null;
  weeklyTss?: number | null;
}

/**
 * 클럽 내부 랭킹 스냅샷 — groups/{groupId}/rankings/{metric} 단일 doc.
 * Cloud Function rebuildGroupLeaderboard 가 멤버 능력치를 배치 조회해 사전 정렬 저장.
 * 클라는 멤버 fan-out 없이 이 doc 1개만 읽어 전체 랭킹을 표시한다.
 */
export interface GroupLeaderboard {
  groupId: string;
  metric: GroupLeaderboardMetric;
  discipline: 'bike' | 'run' | 'swim' | 'tri';
  computedAt: number;
  entries: GroupLeaderboardEntry[];
}

export interface GroupPendingRequest {
  userId: string;
  requestedAt: number;
  message?: string;
}

export interface GroupInvitation {
  groupName: string;
  inviterId: string;
  invitedAt: number;
}

// ── Group Ride ───────────────────────────────────────────────────────
export interface GroupRide {
  id: string;
  groupId: string;
  startTime: number;
  endTime: number;
  participantCount: number;
  totalDistance: number;
  participants: Record<string, GroupRideParticipant>;
  createdAt: number;
}

export interface GroupRideParticipant {
  activityId: string;
  nickname: string;
  profileImage: string | null;
  distance: number;
  ridingTimeMillis: number;
  averageSpeed: number;
  averageHeartRate: number | null;
  averagePower: number | null;
  averageCadence: number | null;
}

// ── Friend (양방향) ──────────────────────────────────────────────────
export interface FriendRelation {
  userId: string;
  nickname: string;
  profileImage: string | null;
  friendCode: string | null;
  createdAt: number;
}

export interface FriendRequest {
  requesterId: string;
  nickname: string;
  profileImage: string | null;
  createdAt: number;
}

/** @deprecated Use FriendRelation instead */
export type FollowRelation = FriendRelation;

// ── Migration ────────────────────────────────────────────────────────
export type MigrationStatus = "NOT_STARTED" | "QUEUED" | "RUNNING" | "WAITING" | "DONE" | "FAILED";

export interface MigrationProgress {
  totalActivities: number;
  importedActivities: number;
  skippedActivities: number;
  currentPage: number;
  startedAt: number;
  updatedAt: number;
  queuePosition: number | null;
  waitUntil: number | null;
}

export interface MigrationReport {
  totalActivities: number;
  totalDistance: number;
  totalTime: number;
  totalElevation: number;
  totalCalories: number;
  earliestActivity: number;
  latestActivity: number;
  topRoutes: { name: string; distance: number; count: number }[];
}

export interface MigrationState {
  status: MigrationStatus;
  progress: MigrationProgress | null;
  report: MigrationReport | null;
}

// ── User & Profile ───────────────────────────────────────────────────
export type Visibility = 'everyone' | 'friends' | 'private';

export interface UserStats {
  activityCount: number;
  totalDistance: number;      // meters
  totalRidingTime: number;    // milliseconds
  totalElevationGain: number; // meters
}

export interface HrZone {
  name: string;
  minPct: number;
  maxPct: number | null; // null = 상한 없음 (Z5)
  color: string;
}

export type BloodType =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'O+'
  | 'O-'
  | 'AB+'
  | 'AB-'
  | 'UNKNOWN';

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
}

/**
 * 의료/응급 PII — owner-only 서브컬렉션 `users/{uid}/private/medical` (#524).
 * 루트 users 문서가 전체 인증 사용자에게 read 되므로 민감 정보는 여기로 분리. owner 만 read/write.
 */
export interface MedicalProfile {
  bloodType?: BloodType | null;
  /** 복용 중인 약 — 쉼표 구분 자유 텍스트 */
  medications?: string | null;
  /** 알레르기·만성질환·특이사항 자유 텍스트 */
  allergies?: string | null;
  emergencyContact?: EmergencyContact | null;
}

export interface UserProfile {
  nickname: string;
  email: string | null;
  photoURL: string | null;
  bio?: string;
  // TODO: 향후 서브컬렉션으로 이동 대상
  // - stravaConnected, stravaAthleteId, stravaNickname → users/{uid}/strava_profile/info
  stravaConnected: boolean;
  stravaAthleteId: number | null;
  stravaNickname: string | null;
  defaultVisibility?: Visibility;
  autoUpload?: boolean;
  profilePublic?: boolean;
  leaderboardOptIn?: boolean;
  friendRequestsAllowed?: boolean;
  // TODO: 향후 서브컬렉션으로 이동 대상
  // - ftp, maxHr, weightKg, hrZones, lthr, thresholdPace, css → users/{uid}/training_profile/current
  ftp?: number;
  maxHr?: number;
  weightKg?: number;
  heightCm?: number;
  /** @deprecated #524 — owner-only `users/{uid}/private/medical`(MedicalProfile)로 이전. 레거시 루트 값은 마이그레이션이 제거. 신규 read/write 금지. */
  bloodType?: BloodType;
  /** @deprecated #524 — MedicalProfile.medications 로 이전 */
  medications?: string;
  /** @deprecated #524 — MedicalProfile.allergies 로 이전 */
  allergies?: string;
  /** @deprecated #524 — MedicalProfile.emergencyContact 로 이전 */
  emergencyContact?: EmergencyContact;
  hrZones?: HrZone[];
  lthr?: number;           // 젖산 역치 심박수 (bpm)
  thresholdPace?: number;  // 역치 페이스 (초/km)
  css?: number;            // 임계 수영 속도 (초/100m)
  language?: string;
  locale?: 'ko' | 'en';
  units?: 'metric' | 'imperial';
  createdAt?: number;
  migration?: MigrationState;
  stats?: UserStats;
  onboardingStep?: "discipline" | "strava" | "goal" | "done";
  primaryDiscipline?: "tri" | "bike" | "run" | "swim";
  /**
   * 라이프스타일 — 개인화 주간 권장부하(G5) 상한 보정용.
   * weeklyAvailableHours: 주당 훈련 가용 시간, occupationLoad: 직업 신체부하.
   * TODO(후속): 설정 페이지 UI 입력 추가 (현재는 타입만 — 데이터 있으면 즉시 반영됨).
   */
  lifestyle?: {
    weeklyAvailableHours?: number;
    occupationLoad?: "low" | "mid" | "high";
  };
}

// ── REST API Types ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiKeyRecord {
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitTier: 'free' | 'premium';
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
}

// ── Course (코스) ───────────────────────────────────────────────────

export interface CourseTrackPoint {
  lat: number;
  lon: number;
  alt: number;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  creatorNickname: string;
  creatorProfileImage: string | null;
  source: 'activity' | 'activity_section' | 'gpx' | 'app_share';
  sourceActivityId: string | null;
  polyline: string;           // encoded polyline (200pt sampled)
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  geoHash: string;
  distance: number;           // meters
  elevationGain: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  keywords: string[];
  regions: string[];          // 지역 배지 ("성남시", "서울특별시")
  likeCount: number;
  viewCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  trackPoints?: CourseTrackPoint[];
  /** 코스 경로 위의 세그먼트 id (역링크 #495, onCourseCreatedLinkSegments 가 작성). */
  segmentIds?: string[];
}

export interface CreateCourseFromSharedRouteRequest {
  name: string;
  trackPoints: { lat: number; lon: number; alt: number }[];
  distance: number;
  elevationGain: number;
}

export interface CreateCourseFromActivityRequest {
  activityId: string;
  name: string;
  description: string;
}

export interface CreateCourseFromSectionRequest {
  activityId: string;
  startIndex: number;
  endIndex: number;
  name: string;
  description: string;
}

export interface CreateCourseFromGpxRequest {
  gpxXml: string;
  name: string;
  description: string;
}

// ── Community Board ─────────────────────────────────────────────────

export type BoardType = 'free' | 'hot' | 'archive' | 'gear' | 'course' | 'inquiry' | 'devlog';

export type FeedbackType = 'bug' | 'feature' | 'question' | 'other';

export interface BoardPost {
  id: string;
  boardType: BoardType;
  userId: string;
  nickname: string;
  profileImage: string | null;
  title: string;
  content: string;
  tags: string[];
  imageUrls: string[];
  activityId?: string | null;
  sourceUrl?: string | null;
  sourceSite?: string | null;
  selectionReason?: string | null;
  commentReaction?: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  feedbackType?: FeedbackType | null;
  isPrivate?: boolean;
  deletedAt?: number | null;
}

export interface BoardComment {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  text: string;
  createdAt: number;
  deletedAt?: number | null;
}

// ── Streams ──────────────────────────────────────────────────────────
export interface ActivityStreams {
  userId: string;
  latlng?: [number, number][];
  altitude?: number[];
  heartrate?: number[];
  watts?: number[];
  watts_calc?: number[];      // 가상 파워 (파워미터 없는 활동)
  cadence?: number[];
  velocity_smooth?: number[];
  time?: number[];
  distance?: number[];
  /** 기록 기기(Garmin/Wahoo 등) 온도센서 실측값 °C. Strava temp 스트림 패스스루.
   *  키 이름은 Strava 스트림 타입(temp)을 그대로 사용 — Activity.weather.temperature(API 표시값)와 구분 */
  temp?: number[];
  // Orider 확장 필드 (앱에서 업로드)
  laps?: LapData[];
  calories?: number;
  ftp?: number;
  maxHr?: number;
}

export interface LapData {
  number: number;
  distanceKm: number;
  durationMs: number;
  avgSpeed: number;
  maxSpeed: number;
  avgCadence: number;
  avgHeartRate: number;
  avgPower: number;
}

// ── Fitness (서브컬렉션: users/{uid}/fitness/current) ────────────
export interface FitnessBreakdown {
  ctl: number;
  atl: number;
  tsb: number;
  weeklyTSS: number;
}

export interface UserFitness {
  updatedAt: number;
  totalCTL: number;
  totalATL: number;
  totalTSB: number;
  breakdown: {
    bike: FitnessBreakdown;
    run: FitnessBreakdown;
    swim: FitnessBreakdown;
  };
  thresholds: {
    bike: { ftp: number; ftpUpdatedAt?: number };
    run: { thresholdPace: number; vVO2?: number };
    swim: { css: number; cssUpdatedAt?: number };
  };
  projection?: {
    goalId: string;
    goalDate: number;
    projectedCTL: number;
    projectedTSB: number;
    compliancePct: number;
  };
}

export * from "./types/goal";

// ── Provider Connection (Stage 0+) ──────────────────────────────────────

export type ProviderId =
  | "strava"
  | "apple_health"
  | "health_connect";

export type ConnectionStatus =
  | "active"
  | "reauth_required"
  | "revoked"
  | "error";

/**
 * `users/{uid}/connections/{providerId}` 문서 — 웹에서 읽기 전용.
 * 서버(Cloud Functions) 만 쓰기 가능 (Firestore rules).
 */
export interface ConnectionDoc {
  providerId: ProviderId;
  uid: string;
  status: ConnectionStatus;
  scopes: string[];
  /** 최초 연결 시각 (epoch ms) */
  connectedAt: number;
  lastSyncAt?: number;
  lastErrorAt?: number;
  lastErrorMessage?: string;
  /** provider별 부가 메타 — Strava: athleteId/athleteName/autoUpload, HealthKit/HC: deviceModel 등 */
  meta?: Record<string, unknown>;
}

// ── Health Preferences (Stage 1 §6-4) ──────────────────────────────────

export type HealthSport = "bike" | "run" | "swim" | "other";

/**
 * `users/{uid}/health_preferences/main` — 종목별 주 소스 선택 + 보존 정책.
 *
 * Stage 1 한정 dedup 정책 — 같은 운동이 여러 source 에 있을 때 어느 것을 메인 카드로
 * 표시할지 사용자가 종목별로 선택. Stage 3 dedup 알고리즘의 ground truth 로 재활용.
 */
export interface HealthPreferences {
  /** 종목별 주 소스. 미설정 종목은 defaultPrimarySource 로 fallback */
  primarySource: Partial<Record<HealthSport, ProviderId>>;
  /** 종목별 미설정 시 fallback. 보통 사용자의 첫 연결 source */
  defaultPrimarySource?: ProviderId;
  /**
   * 헬스 sample 원본 영구 보존 옵트인 (§6-3).
   * 기본 false — `health_metrics/{uid}/samples/*` 는 Firestore TTL 365일 자동 삭제.
   * true 면 TTL 해제 (서버는 단순히 TTL 필드 제거 — Stage 2 동작).
   */
  retainSamplesForever?: boolean;
  updatedAt?: number;
}

// ── Gear (바이크 킷) ──────────────────────────────────────────────────
/**
 * 장비 아이템 — 바이크/휠/파워미터/기타.
 * Firestore 경로: `users/{uid}/gear/{gearId}`.
 *
 * #286 바이크 킷 관리 / #287 코스 시뮬레이터 입력원.
 */
export interface Gear {
  id: string;
  name: string;
  type: "bike" | "wheel" | "powermeter" | "other";
  brand?: string;
  model?: string;
  /** 장비 무게 (kg). 바이크: 프레임+구동계 무게. */
  weightKg?: number;
  /** 기본 장비 여부 — 활동 기록 시 자동 연결 대상. */
  isDefault?: boolean;
  createdAt: number;  // Unix ms
  updatedAt: number;  // Unix ms

  // ── 시뮬레이터용 물리 파라미터 (type === "bike" 한정, #287 코스 시뮬레이터가 읽음) ──
  /**
   * 항력계수 × 전면적 (CdA, m²).
   * 자세별 기본값: Hoods ≈ 0.32 / Drops ≈ 0.28 / Aero ≈ 0.25 / TT ≈ 0.22.
   */
  cda?: number;
  /**
   * 구름 저항 계수 (Crr, 무차원).
   * 노면별 기본값: 로드 ≈ 0.004 / 그래블 ≈ 0.006 / MTB ≈ 0.012.
   */
  crr?: number;
  /**
   * 드라이브트레인 효율 (0 ~ 1).
   * 기본값 0.97 (체인 구동 일반 효율).
   */
  drivetrainEfficiency?: number;
}
