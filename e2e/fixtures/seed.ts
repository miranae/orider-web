const FIRESTORE_EMULATOR = 'http://localhost:8080';
const PROJECT_ID = 'orider-g1';

function firestoreUrl(path: string) {
  return `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

function toFirestoreValue(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFirestoreFields(obj: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

async function putDoc(collection: string, docId: string, data: Record<string, unknown>) {
  // Use PATCH on the full document path (idempotent: creates or overwrites)
  const resp = await fetch(`${firestoreUrl(collection)}/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`putDoc ${collection}/${docId} failed: ${resp.status} ${text}`);
  }
}

// --- Test IDs ---
export let TEST_USER_ID = 'test-user-001';
export const FRIEND_USER_ID = 'test-user-002';
export const OTHER_USER_ID = 'test-user-003';

export const ACTIVITY_IDS = {
  publicRide: 'act-public-001',
  publicRide2: 'act-public-002',
  friendsOnly: 'act-friends-001',
  private: 'act-private-001',
  otherUser: 'act-other-001',
};

export const SEGMENT_IDS = {
  hillClimb1: 'seg-climb-001',
  hillClimb2: 'seg-climb-002',
  flat: 'seg-flat-001',
};

const NOW = Date.now();
const HOUR = 3600_000;

/** Seed all test data into the Firestore Emulator.
 *  @param primaryUserId  If provided, overrides TEST_USER_ID (use auth emulator UID for matching).
 */
export async function seedTestData(primaryUserId?: string) {
  if (primaryUserId) TEST_USER_ID = primaryUserId;
  // --- Users ---
  await putDoc('users', TEST_USER_ID, {
    nickname: '테스트라이더',
    email: 'test@example.com',
    photoURL: null,
    stravaConnected: false,
    stravaAthleteId: null,
    stravaNickname: null,
    defaultVisibility: 'everyone',
    createdAt: NOW - 30 * 24 * HOUR,
    friendCode: 'TEST01',
  });

  await putDoc('users', FRIEND_USER_ID, {
    nickname: '친구라이더',
    email: 'friend@example.com',
    photoURL: null,
    stravaConnected: true,
    stravaAthleteId: 12345,
    stravaNickname: 'FriendStrava',
    defaultVisibility: 'everyone',
    createdAt: NOW - 20 * 24 * HOUR,
    friendCode: 'FRND02',
  });

  await putDoc('users', OTHER_USER_ID, {
    nickname: '다른사용자',
    email: 'other@example.com',
    photoURL: null,
    stravaConnected: false,
    stravaAthleteId: null,
    stravaNickname: null,
    defaultVisibility: 'everyone',
    createdAt: NOW - 10 * 24 * HOUR,
    friendCode: 'OTHR03',
  });

  // --- Activities ---
  const baseSummary = {
    distance: 42500,
    ridingTimeMillis: 5400000,
    averageSpeed: 28.3,
    maxSpeed: 52.1,
    averageCadence: 85,
    maxCadence: 110,
    averageHeartRate: 145,
    maxHeartRate: 178,
    averagePower: 195,
    maxPower: 420,
    normalizedPower: 210,
    elevationGain: 520,
    calories: 850,
    relativeEffort: 120,
  };

  await putDoc('activities', ACTIVITY_IDS.publicRide, {
    userId: TEST_USER_ID,
    nickname: '테스트라이더',
    profileImage: null,
    type: 'ride',
    createdAt: NOW - 2 * HOUR,
    startTime: NOW - 4 * HOUR,
    endTime: NOW - 2.5 * HOUR,
    summary: baseSummary,
    thumbnailTrack: 'o}rrFxhf_W...',
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 1,
    commentCount: 1,
    segmentEffortCount: 0,
    description: '한강 라이딩 즐거웠습니다',
    visibility: 'everyone',
    gpxPath: null,
  });

  await putDoc('activities', ACTIVITY_IDS.publicRide2, {
    userId: FRIEND_USER_ID,
    nickname: '친구라이더',
    profileImage: null,
    type: 'ride',
    createdAt: NOW - 5 * HOUR,
    startTime: NOW - 8 * HOUR,
    endTime: NOW - 5.5 * HOUR,
    summary: { ...baseSummary, distance: 65000, elevationGain: 890, averageSpeed: 25.1 },
    thumbnailTrack: '',
    groupId: null,
    groupRideId: null,
    photoCount: 2,
    kudosCount: 3,
    commentCount: 0,
    segmentEffortCount: 1,
    description: '북한산 힐클라임 도전',
    visibility: 'everyone',
    gpxPath: null,
  });

  await putDoc('activities', ACTIVITY_IDS.friendsOnly, {
    userId: TEST_USER_ID,
    nickname: '테스트라이더',
    profileImage: null,
    type: 'ride',
    createdAt: NOW - 24 * HOUR,
    startTime: NOW - 26 * HOUR,
    endTime: NOW - 24.5 * HOUR,
    summary: { ...baseSummary, distance: 30000, elevationGain: 200 },
    thumbnailTrack: '',
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: '출퇴근 라이딩',
    visibility: 'friends',
    gpxPath: null,
  });

  await putDoc('activities', ACTIVITY_IDS.private, {
    userId: TEST_USER_ID,
    nickname: '테스트라이더',
    profileImage: null,
    type: 'ride',
    createdAt: NOW - 48 * HOUR,
    startTime: NOW - 50 * HOUR,
    endTime: NOW - 48.5 * HOUR,
    summary: { ...baseSummary, distance: 15000, elevationGain: 50 },
    thumbnailTrack: '',
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: '동네 한바퀴',
    visibility: 'private',
    gpxPath: null,
  });

  await putDoc('activities', ACTIVITY_IDS.otherUser, {
    userId: OTHER_USER_ID,
    nickname: '다른사용자',
    profileImage: null,
    type: 'ride',
    createdAt: NOW - 3 * HOUR,
    startTime: NOW - 6 * HOUR,
    endTime: NOW - 3.5 * HOUR,
    summary: { ...baseSummary, distance: 55000, elevationGain: 700 },
    thumbnailTrack: '',
    groupId: null,
    groupRideId: null,
    photoCount: 1,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: '팔당댐 왕복',
    visibility: 'everyone',
    gpxPath: null,
  });

  // --- Kudos (subcollection: activities/{activityId}/kudos/{userId}) ---
  await putDoc(`activities/${ACTIVITY_IDS.publicRide}/kudos`, FRIEND_USER_ID, {
    userId: FRIEND_USER_ID,
    nickname: '친구라이더',
    profileImage: null,
    createdAt: NOW - HOUR,
  });

  // --- Comments (subcollection: activities/{activityId}/comments/{commentId}) ---
  await putDoc(`activities/${ACTIVITY_IDS.publicRide}/comments`, 'comment-001', {
    id: 'comment-001',
    userId: FRIEND_USER_ID,
    nickname: '친구라이더',
    profileImage: null,
    text: '좋은 라이딩이네요!',
    createdAt: NOW - HOUR,
  });

  // --- Segments ---
  await putDoc('segments', SEGMENT_IDS.hillClimb1, {
    id: SEGMENT_IDS.hillClimb1,
    name: '북한산 우이령길',
    description: '우이령 정상까지 오르막 구간',
    creatorId: TEST_USER_ID,
    source: 'official',
    status: 'active',
    startLat: 37.658,
    startLon: 127.012,
    endLat: 37.672,
    endLon: 127.018,
    polyline: '',
    distance: 4200,
    elevationGain: 380,
    averageGrade: 9.0,
    geoHash: 'wydm6d',
    category: 'climb',
    climbCategory: '3',
    totalEfforts: 12,
    starCount: 5,
    kom: { time: 720000, userId: FRIEND_USER_ID, nickname: '친구라이더', recordedAt: NOW - 7 * 24 * HOUR },
    qom: null,
  });

  await putDoc('segments', SEGMENT_IDS.hillClimb2, {
    id: SEGMENT_IDS.hillClimb2,
    name: '남산 순환도로',
    description: '남산 정상 순환 코스',
    creatorId: OTHER_USER_ID,
    source: 'official',
    status: 'active',
    startLat: 37.548,
    startLon: 126.988,
    endLat: 37.551,
    endLon: 126.992,
    polyline: '',
    distance: 3500,
    elevationGain: 210,
    averageGrade: 6.0,
    geoHash: 'wydm5x',
    category: 'climb',
    climbCategory: '4',
    totalEfforts: 45,
    starCount: 12,
    kom: null,
    qom: null,
  });

  await putDoc('segments', SEGMENT_IDS.flat, {
    id: SEGMENT_IDS.flat,
    name: '한강 잠실-여의도',
    description: '한강 자전거길 평지 구간',
    creatorId: TEST_USER_ID,
    source: 'official',
    status: 'active',
    startLat: 37.518,
    startLon: 127.073,
    endLat: 37.526,
    endLon: 126.933,
    polyline: '',
    distance: 15000,
    elevationGain: 20,
    averageGrade: 0.1,
    geoHash: 'wydm4w',
    category: 'flat',
    climbCategory: null,
    totalEfforts: 120,
    starCount: 30,
    kom: null,
    qom: null,
  });

  // --- Segment Efforts (subcollection: segment_efforts/{segmentId}/efforts/{effortId}) ---
  for (let i = 1; i <= 3; i++) {
    await putDoc(`segment_efforts/${SEGMENT_IDS.hillClimb1}/efforts`, `effort-${i}`, {
      id: `effort-${i}`,
      userId: i === 1 ? FRIEND_USER_ID : i === 2 ? TEST_USER_ID : OTHER_USER_ID,
      nickname: i === 1 ? '친구라이더' : i === 2 ? '테스트라이더' : '다른사용자',
      profileImage: null,
      activityId: i === 1 ? ACTIVITY_IDS.publicRide2 : i === 2 ? ACTIVITY_IDS.publicRide : ACTIVITY_IDS.otherUser,
      elapsedTime: 720000 + i * 60000,
      averageSpeed: 21 - i,
      averageHeartRate: 165 + i * 3,
      averagePower: 280 - i * 10,
      averageCadence: 78 + i,
      recordedAt: NOW - i * 24 * HOUR,
      rank: i,
    });
  }

  for (let i = 1; i <= 2; i++) {
    await putDoc(`segment_efforts/${SEGMENT_IDS.flat}/efforts`, `effort-flat-${i}`, {
      id: `effort-flat-${i}`,
      userId: i === 1 ? TEST_USER_ID : FRIEND_USER_ID,
      nickname: i === 1 ? '테스트라이더' : '친구라이더',
      profileImage: null,
      activityId: i === 1 ? ACTIVITY_IDS.publicRide : ACTIVITY_IDS.publicRide2,
      elapsedTime: 1800000 + i * 120000,
      averageSpeed: 30 - i,
      averageHeartRate: 150,
      averagePower: 200,
      averageCadence: 88,
      recordedAt: NOW - i * 24 * HOUR,
      rank: i,
    });
  }

  // --- Friend relation (subcollection: friends/{userId}/users/{friendId}) ---
  await putDoc(`friends/${TEST_USER_ID}/users`, FRIEND_USER_ID, {
    userId: FRIEND_USER_ID,
    nickname: '친구라이더',
    profileImage: null,
    friendCode: 'FRND02',
    createdAt: NOW - 15 * 24 * HOUR,
  });

  await putDoc(`friends/${FRIEND_USER_ID}/users`, TEST_USER_ID, {
    userId: TEST_USER_ID,
    nickname: '테스트라이더',
    profileImage: null,
    friendCode: 'TEST01',
    createdAt: NOW - 15 * 24 * HOUR,
  });
}

/** Clear ALL data from the Firestore Emulator. */
export async function clearEmulatorData() {
  await fetch(
    `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}
