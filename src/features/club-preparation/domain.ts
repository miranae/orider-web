import { elevationProfileSchema, meetingSegmentsSchema, type MeetingSegment } from './segmentCatalog';
import { z } from 'zod';
export const STORAGE_KEY = 'orider.club-preparation.v1';
export const BASE_TIME = Date.parse('2026-10-18T09:00:00+09:00');
export type Kind = { id: string; name: string; active: boolean };
export type Member = { id: string; name: string };
export type Attendance = 'joined' | 'waiting' | 'offered' | 'cancelled';
export type Registration = { attendanceGeneration?: string; memberId: string; status: Attendance; order: number; offerUntil?: number; payment: 'unpaid' | 'reported' | 'confirmed'; sender?: string; refundDue: number; refunded: number; joinId?: string; outbound: string; inbound: string };
export type Notice = { id: string; title: string; body: string; targets: string[]; confirmed: string[]; at: number };
export type CoursePoint = { lat: number; lon: number; ele?: number };
export type CourseTrack = { fileName: string; points: CoursePoint[]; segmentStarts?: number[]; elevationProfile?: {distance: number; elevation: number}[]; distanceKm: number; elevationGainM?: number };
export type CourseSource = { kind: 'saved-course' | 'gpx' | 'segments'; id?: string; name: string; importedAt?: number };
export type CourseCheckpoint = { name: string; type?: string; note?: string; lat?: number; lon?: number; distanceKm?: number; source: 'course' | 'gpx' | 'segments' | 'manual'; segmentId?: string; segmentEndpoint?: 'start' | 'end'; offTrackM?: number };
export type Recruitment = 'open' | 'waitlist' | 'closed';
export type MeetingTeam = { id: string; name: string; capacity?: number; leaderId?: string; memberIds: string[] };
export type Meeting = { teams?: MeetingTeam[]; id: string; kindName?: string; hostId?: string; courseSource?: CourseSource; courseCheckpoints?: CourseCheckpoint[]; kindId: string; title: string; date: string; time: string; place: string; capacity: number; pace: string; description: string; courseReady: boolean; fee: number; joins: { id: string; place: string; time: string }[]; parking: string; weather: string; status: 'open' | 'cancelled'; recruitment?: Recruitment; registrations: Registration[]; notices: Notice[]; courseInfoVersion?: 1; distanceKm?: number; elevationGainM?: number; courseHighlights?: string; courseStops?: string[]; courseTrack?: CourseTrack; segments?: MeetingSegment[] };
export type State = { version: 1; clubManagerIds?: string[]; kinds: Kind[]; members: Member[]; meetings: Meeting[]; now: number };
export type Action = { type: 'recruitment' | 'join' | 'cancel' | 'accept' | 'report' | 'confirmPayment' | 'rejectPayment' | 'refund' | 'offer' | 'cancelMeeting' | 'notice' | 'ack' | 'travel'; meetingId: string; actor: string; target?: string; text?: string; title?: string; joinId?: string; outbound?: string; inbound?: string; noticeId?: string };
export const meetingHostId = (m: Meeting): string => m.hostId ?? 'host';
export const isMeetingHost = (m: Meeting, actor: string): boolean => meetingHostId(m) === actor;
export const isClubManager = (s: State, actor: string): boolean => s.members.some(member => member.id === actor) && (s.clubManagerIds ?? ['host']).includes(actor);
export const recruitmentState = (m: Meeting): Recruitment => m.recruitment ?? 'open';
const recruitmentLabel = (value: Recruitment) => ({ open: '참석·대기 접수', waitlist: '대기만 접수', closed: '신규 접수 마감' })[value];
export const active = (r: Registration) => r.status === 'joined' || r.status === 'offered';
export const occupied = (m: Meeting) => m.registrations.filter(active).length;
export const memberName = (s: State, id: string) => s.members.find(m => m.id === id)?.name ?? '회원';
export const kindName = (s: State, id: string) => s.kinds.find(k => k.id === id)?.name ?? '이전 종류';
export function expireOffers(state: State, now = state.now): State {
  return { ...state, now, meetings: state.meetings.map(m => ({ ...m, registrations: m.registrations.map(r => m.status !== 'cancelled' && r.status === 'offered' && (r.offerUntil ?? 0) <= now ? { ...r, status: 'waiting', offerUntil: undefined, order: Math.max(...m.registrations.map(p => p.order), 0) + 1 } : r) })) };
}
export function transition(source: State, a: Action): State {
  const state = structuredClone(expireOffers(source));
  const m = state.meetings.find(m => m.id === a.meetingId);
  if (!m) throw new Error('모임을 찾을 수 없습니다.');
  const host = isMeetingHost(m, a.actor);
  if (!state.members.some(member => member.id === a.actor)) throw new Error('등록된 예시 회원이 아닙니다.');
  if (['join', 'cancel', 'accept', 'report', 'travel'].includes(a.type) && a.target && a.target !== a.actor) throw new Error('본인의 신청만 변경할 수 있습니다.');
  const r = m.registrations.find(r => r.memberId === (a.target ?? a.actor));
  if (['recruitment', 'offer', 'confirmPayment', 'rejectPayment', 'refund', 'cancelMeeting', 'notice'].includes(a.type) && !host) throw new Error('주최자만 처리할 수 있습니다.');
  if (m.status === 'cancelled' && !['ack', 'refund', 'confirmPayment', 'rejectPayment'].includes(a.type)) throw new Error('취소된 모임입니다.');
  if (['join', 'accept', 'offer'].includes(a.type) && Date.parse(`${m.date}T${m.time}:00+09:00`) <= state.now) throw new Error('출발 시각이 지나 추가 접수가 끝났습니다.');
  const addNotice = (title: string, body: string) => m.notices.unshift({ id: `notice-${state.now}-${m.notices.length}`, title, body, at: state.now, targets: m.registrations.filter(r => r.status !== 'cancelled').map(r => r.memberId), confirmed: [] });
  if (a.type === 'recruitment') {
    if (!['open', 'waitlist', 'closed'].includes(a.text ?? '')) throw new Error('모집 상태를 확인해주세요.');
    const next = a.text as Recruitment;
    if (recruitmentState(m) !== next) {
      addNotice('모집 상태가 변경되었어요', `${recruitmentLabel(recruitmentState(m))} → ${recruitmentLabel(next)}`);
      m.recruitment = next;
    }
  } else if (a.type === 'join') {
    if (recruitmentState(m) === 'closed') throw new Error('신규 접수가 마감된 모임입니다.');
    if (r && r.status !== 'cancelled') throw new Error('이미 신청한 모임입니다.');
    if (r) throw new Error('취소 이력을 보존하기 위해 이 예시에서는 같은 모임에 재신청할 수 없습니다.');
    const registration: Registration = { memberId: a.actor, status: recruitmentState(m) === 'open' && occupied(m) < m.capacity && !m.registrations.some(p => p.status === 'waiting') ? 'joined' : 'waiting', order: Math.max(...m.registrations.map(r => r.order), 0) + 1, payment: 'unpaid', refundDue: 0, refunded: 0, outbound: '미정', inbound: '미정' };
    if (r) Object.assign(r, registration); else m.registrations.push(registration);
  } else if (a.type === 'cancelMeeting') {
    if (!a.text?.trim()) throw new Error('취소 사유를 입력해주세요.');
    addNotice('모임이 취소되었습니다', a.text);
    m.status = 'cancelled';
    m.registrations.forEach(r => { r.offerUntil = undefined; if (r.payment === 'confirmed' && r.refunded === 0) r.refundDue = m.fee; });
  } else if (a.type === 'notice') {
    if (!a.text?.trim()) throw new Error('공지 내용을 입력해주세요.');
    addNotice(a.title ?? '모임 안내', a.text);
  } else if (a.type === 'ack') {
    const n = m.notices.find(n => n.id === a.noticeId);
    if (!n?.targets.includes(a.actor)) throw new Error('내게 전달된 공지가 아닙니다.');
    if (!n.confirmed.includes(a.actor)) n.confirmed.push(a.actor);
  } else {
    if (!r) throw new Error('신청 내역이 없습니다.');
    if (!host && r.memberId !== a.actor) throw new Error('본인의 신청만 변경할 수 있습니다.');
    if (a.type === 'cancel') { if (r.status === 'cancelled') throw new Error('이미 취소한 신청입니다.'); r.status = 'cancelled'; r.offerUntil = undefined; r.joinId = undefined; if (r.payment === 'confirmed') r.refundDue = m.fee; }
    if (a.type === 'offer') {
      if (r.status !== 'waiting' || occupied(m) >= m.capacity) throw new Error('제안할 빈자리가 없습니다.');
      const first = m.registrations.filter(r => r.status === 'waiting').sort((a, b) => a.order - b.order)[0];
      if (first !== r) throw new Error('먼저 기다린 회원에게 제안해주세요.');
      r.status = 'offered'; r.offerUntil = Math.min(state.now + 30 * 60_000, Date.parse(`${m.date}T${m.time}:00+09:00`));
    }
    if (a.type === 'accept') { if (r.status !== 'offered') throw new Error('유효한 자리 제안이 없습니다.'); r.status = 'joined'; r.offerUntil = undefined; }
    if (a.type === 'report') { if (r.status !== 'joined' || !m.fee || r.payment === 'confirmed' || !a.text?.trim()) throw new Error('송금자명을 입력하고 참가 상태를 확인해주세요.'); r.payment = 'reported'; r.sender = a.text.trim(); }
    if (a.type === 'confirmPayment') { if (r.payment !== 'reported') throw new Error('입금 신고 내용을 먼저 확인해주세요.'); r.payment = 'confirmed'; if (r.status === 'cancelled' || m.status === 'cancelled') r.refundDue = m.fee; }
    if (a.type === 'rejectPayment') { if (r.payment !== 'reported') throw new Error('입금 신고가 없습니다.'); r.payment = 'unpaid'; r.sender = undefined; }
    if (a.type === 'refund') { if (!r.refundDue) throw new Error('환불할 금액이 없습니다.'); r.refunded += r.refundDue; r.refundDue = 0; }
    if (a.type === 'travel') { if (r.status !== 'joined') throw new Error('참가 확정 후 이동 계획을 저장해주세요.'); if (a.joinId && !m.joins.some(j => j.id === a.joinId)) throw new Error('합류 지점을 확인해주세요.'); r.joinId = a.joinId; r.outbound = a.outbound ?? '미정'; r.inbound = a.inbound ?? '미정'; }
  }
  return state;
}
export function duplicateMeeting(m: Meeting, id: string): Meeting { return { ...structuredClone(m), id, hostId: undefined, title: `${m.title} (복사)`, status: 'open', registrations: [], notices: [], recruitment: 'open', weather: '', courseReady: false }; }
export function saveMeeting(s: State, actor: string, m: Meeting): State {
  if (!s.members.some(member => member.id === actor)) throw new Error('등록된 회원만 모임을 만들 수 있습니다.');
  const current = s.meetings.find(x => x.id === m.id);
  if (current && !isMeetingHost(current, actor)) throw new Error('이 모임의 주최자만 수정할 수 있습니다.');
  if (current && m.hostId !== undefined && m.hostId !== meetingHostId(current)) throw new Error('모임 주최자는 변경할 수 없습니다.');
  m = { ...m, hostId: current ? meetingHostId(current) : actor, status: current?.status ?? 'open' };
  if (!m.title.trim() || !m.place.trim() || !m.date || !m.time || !Number.isInteger(m.capacity) || m.capacity < 1 || !Number.isFinite(m.fee) || m.fee < 0) throw new Error('제목, 일시, 장소와 올바른 정원·비용을 입력해주세요.');
  if (!s.kinds.some(k => k.id === m.kindId && (k.active || s.meetings.some(x => x.id === m.id && x.kindId === k.id)) )) throw new Error('사용 중인 모임 종류를 선택해주세요.');
  const departure = Date.parse(`${m.date}T${m.time}:00+09:00`);
  if (!Number.isFinite(departure) || ((!current || current.date !== m.date || current.time !== m.time) && departure <= s.now)) throw new Error('출발 일시를 현재 시각 이후로 설정해주세요.');
  if (current?.status === 'cancelled') throw new Error('취소된 모임은 복사해 새로 열어주세요.');
  if (current && current.registrations.length && current.fee !== m.fee) throw new Error('신청 이력 보호를 위해 접수 후 선납금은 변경할 수 없습니다.');
  if (current?.registrations.some(r => r.joinId && !m.joins.some(j => j.id === r.joinId))) throw new Error('선택한 회원이 있는 합류 지점은 삭제할 수 없습니다.');
  if (m.capacity < occupied(current ?? m)) throw new Error('현재 확보된 자리보다 정원을 줄일 수 없습니다.');
  if (m.joins.some(j => !j.place.trim() || !j.time)) throw new Error('합류 장소와 시간을 입력해주세요.');
  if ([m.distanceKm, m.elevationGainM].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error('거리와 획득고도는 0 이상의 숫자로 입력해주세요.');
  if (m.courseTrack !== undefined) m = {...m, courseTrack: courseTrackSchema.parse(m.courseTrack)};
  if (m.courseSource) courseSourceSchema.parse(m.courseSource);
  if (m.courseCheckpoints) z.array(courseCheckpointSchema).max(100).parse(m.courseCheckpoints);
  if (m.segments) { const parsed = meetingSegmentsSchema.parse(m.segments); if (new Set(parsed.map(segment => segment.id)).size !== parsed.length) throw new Error('같은 구간을 중복해서 선택할 수 없습니다.'); m = { ...m, segments: parsed }; }
  m = { ...m, recruitment: current ? current.recruitment : m.recruitment, joins: m.joins.map((j, i) => i ? j : { ...j, place: m.place, time: m.time }) };
  const changes: string[] = [];
  if (current) {
    const change = (label: string, before: string | number | boolean | undefined, after: string | number | boolean | undefined) => {
      if (before !== after) changes.push(`${label}: ${before === undefined || before === '' ? '미정' : before} → ${after === undefined || after === '' ? '미정' : after}.`);
    };
    change('제목', current.title, m.title);
    change('모임 종류', kindName(s, current.kindId), kindName(s, m.kindId));
    change('출발 일시', `${current.date} ${current.time}`, `${m.date} ${m.time}`);
    change('집결 장소', current.place, m.place);
    change('정원', current.capacity, m.capacity);
    change('운용속도·진행 방식', current.pace, m.pace);
    change('상세 안내', current.description, m.description);
    change('코스 소개', current.courseHighlights, m.courseHighlights);
    change('코스 준비', current.courseReady ? '확정' : '준비 중', m.courseReady ? '확정' : '준비 중');
    change('거리', current.distanceKm === undefined ? '미정' : `${current.distanceKm}km`, m.distanceKm === undefined ? '미정' : `${m.distanceKm}km`);
    change('획득고도', current.elevationGainM === undefined ? '미정' : `${current.elevationGainM}m`, m.elevationGainM === undefined ? '미정' : `${m.elevationGainM}m`);
    if (JSON.stringify(current.courseTrack) !== JSON.stringify(m.courseTrack)) changes.push(`GPX: ${current.courseTrack?.fileName ?? '미첨부'} → ${m.courseTrack?.fileName ?? '미첨부'}.`);
    const segments = (meeting: Meeting) => meeting.segments?.map(segment => `${segment.name} (${segment.mode}${segment.instruction ? ` · ${segment.instruction}` : ''})`).join(' → ') || '없음';
    if (JSON.stringify(current.segments) !== JSON.stringify(m.segments)) changes.push(`주요 구간: ${segments(current)} → ${segments(m)}.`);
    change('경유지', current.courseStops?.join(' → '), m.courseStops?.join(' → '));
    const sourceLabel = (source: CourseSource | undefined) => source ? `${({ 'saved-course': '기존 코스', gpx: 'GPX', segments: '세그먼트 조합' })[source.kind]} · ${source.name}` : '미정';
    change('코스 출처', sourceLabel(current.courseSource), sourceLabel(m.courseSource));
    if (sourceLabel(current.courseSource) === sourceLabel(m.courseSource) && current.courseSource?.id !== m.courseSource?.id) changes.push('코스 출처: 이름이 같은 다른 코스로 연결이 변경되었습니다.');
    const checkpoints = (meeting: Meeting) => meeting.courseCheckpoints?.map(point => `${point.name}${point.distanceKm === undefined ? '' : ` (${point.distanceKm}km)`}${point.note ? ` · ${point.note}` : ''}`).join(' / ');
    if (JSON.stringify(current.courseCheckpoints) !== JSON.stringify(m.courseCheckpoints)) changes.push(`체크포인트: ${checkpoints(current) || '없음'} → ${checkpoints(m) || '없음'}.`);
    change('주차 안내', current.parking, m.parking);
    change('우천·진행 판단', current.weather, m.weather);
    const joins = (meeting: Meeting) => meeting.joins.map(j => `${j.place} ${j.time}`).join(' / ');
    change('합류 지점', joins(current), joins(m));
  }
  const notices = current?.notices ?? [];
  const updatedNotices = changes.length && current ? [{
    id: `change-${s.now}-${notices.length}`,
    title: '모임 안내가 변경되었어요',
    body: changes.join(' '),
    at: s.now,
    targets: current.registrations.filter(registration => registration.status !== 'cancelled').map(registration => registration.memberId),
    confirmed: [],
  }, ...notices] : notices;
  m = { ...m, joins: m.joins.map((j, i) => i ? j : { ...j, place: m.place, time: m.time }), registrations: current?.registrations ?? [{ memberId: actor, status: 'joined', order: 1, payment: 'unpaid', refundDue: 0, refunded: 0, joinId: m.joins[0]?.id, outbound: '미정', inbound: '미정' }], notices: updatedNotices };
  return { ...s, meetings: s.meetings.some(x => x.id === m.id) ? s.meetings.map(x => x.id === m.id ? m : x) : [m, ...s.meetings] };
}
export function updateKind(s: State, actor: string, kind: Kind): State {
  if (!isClubManager(s, actor)) throw new Error('클럽 관리자만 모임 종류를 관리할 수 있습니다.');
  if (!kind.name.trim()) throw new Error('종류 이름을 입력해주세요.');
  if (s.kinds.some(k => k.id !== kind.id && k.name === kind.name.trim())) throw new Error('이미 있는 종류 이름입니다.');
  return { ...s, kinds: s.kinds.some(k => k.id === kind.id) ? s.kinds.map(k => k.id === kind.id ? { ...kind, name: kind.name.trim() } : k) : [...s.kinds, { ...kind, name: kind.name.trim() }] };
}
export function createSeed(): State {
  const members = [{ id: 'host', name: '솔바람' }, { id: 'me', name: '나래' }, { id: 'next', name: '여울' }, ...Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, name: ['도토리', '구름', '새벽', '달빛', '초록', '바다', '노을', '별빛', '산들', '오솔', '하늘', '단풍', '은하', '물결', '솔잎', '햇살', '자작', '보리', '라임', '수풀'][i] ?? '회원' }))];
  const registration = (memberId: string, order: number, paid = false): Registration => ({ memberId, order, status: 'joined', payment: paid ? 'confirmed' : 'unpaid', refundDue: 0, refunded: 0, joinId: 'base', outbound: '미정', inbound: '미정' });
  const common = { hostId: 'host', courseInfoVersion: 1 as const, date: '2026-10-25', status: 'open' as const, parking: '', weather: '', notices: [], courseReady: true };
  const tour: Meeting = { ...common, id: 'jeongseon', distanceKm: 100, elevationGainM: 1000, courseHighlights: '노나무재의 가을빛을 지나 소금강과 동강을 따라 달립니다. 정선장터의 토속음식과 가수리 느티나무를 함께 만나요.', courseStops: ['사북 출발', '노나무재', '소금강', '정선장터 · 식사', '가수리', '예미역'], kindId: 'tour', title: '정선의 가을, 함께 단풍길', time: '05:00', place: '분당 집결 광장', capacity: 18, pace: '28–33km/h · 로테 없음', description: '사북에서 노나무재를 넘어 소금강과 동강을 따라 달려요. 약 100km · 1,000m. 버스와 보급을 함께 준비합니다.', fee: 80000, courseReady: false, joins: [{ id: 'base', place: '분당 집결 광장', time: '05:00' }], registrations: [registration('host', 1, true), registration('me', 2), ...Array.from({ length: 16 }, (_, i) => registration(`r${i}`, i + 3, true)), { ...registration('next', 19), status: 'waiting', joinId: undefined }] };
  tour.notices = [{ id: 'course-note', title: '출발 코스 변경', body: '사북에서 출발하는 코스로 다듬고 있어요. 최종 코스는 준비되는 대로 안내합니다.', targets: tour.registrations.map(r => r.memberId), confirmed: ['host'], at: BASE_TIME }];
  return { version: 1, clubManagerIds: ['host'], now: BASE_TIME, kinds: [{ id: 'lightning', name: '번개', active: true }, { id: 'tour', name: '투어', active: true }], members, meetings: [tour, { ...common, id: 'recovery', distanceKm: 62, elevationGainM: 492, courseHighlights: '용인과 안성의 평지와 낙타 구간을 한 바퀴 돌아요. 20km 편의점과 41km 카페에서 쉬며, 마에스트로 구간은 오픈입니다. 200W·Zone2는 선두의 기준으로 개인 강도는 달라요.', courseStops: ['이동읍 출발', '20km · 편의점 보급', '마에스트로 구간', '41km · 카페 보급', '복귀'], kindId: 'lightning', title: '용인–안성 리커버리와 카페', time: '09:00', place: '이동읍 집결 광장', capacity: 15, pace: '30–35km/h · 선두 기준 약 200W', description: '62km · 492m. 20km 편의점, 41km 카페에서 쉬어요. 식사는 희망자만 함께합니다.', fee: 0, weather: '토요일 18시, 우천 시 진행 여부를 안내해요.', joins: [{ id: 'base', place: '이동읍 집결 광장', time: '09:00' }], registrations: [registration('host', 1), ...Array.from({ length: 14 }, (_, i) => registration(`r${i}`, i + 2)), { ...registration('me', 16), status: 'waiting', joinId: undefined }, { ...registration('next', 17), status: 'waiting', joinId: undefined }] }, { ...common, id: 'gimpo', distanceKm: 86, elevationGainM: 220, courseHighlights: '헤이리의 카페와 가을 새우를 찾아가는 평지 라이딩. 바람에 따라 페이스를 조절하고, 인터벌은 참석자 합의가 있을 때만 진행해요. 카페는 대체될 수 있어요.', courseStops: ['김포 터미널', '행주대교 · 중간 합류', '헤이리 · 카페', '전류리 · 식사', '복귀'], kindId: 'tour', title: '김포에서 헤이리, 카페와 새우', time: '08:00', place: '김포 여객터미널 주차장', capacity: 12, pace: '25–33km/h · 로테는 현장 협의', description: '86km · 220m. 카페는 상황에 따라 대체할 수 있어요. 갈 때와 돌아올 때의 이동 방법을 각각 알려주세요.', fee: 0, parking: '주차 위치와 실제 집결 지점을 확인해주세요. 정서진과 혼동하지 마세요.', joins: [{ id: 'base', place: '김포 여객터미널 주차장', time: '08:00' }, { id: 'bridge', place: '행주대교 남단', time: '08:20' }], registrations: [registration('host', 1), { ...registration('me', 2), joinId: 'bridge', outbound: '자전거', inbound: '자전거' }, registration('r0', 3), registration('r1', 4)] }] };
}
const registrationSchema = z.object({ attendanceGeneration: z.string().optional(), memberId: z.string(), status: z.enum(['joined', 'waiting', 'offered', 'cancelled']), order: z.number(), offerUntil: z.number().optional(), payment: z.enum(['unpaid', 'reported', 'confirmed']), sender: z.string().optional(), refundDue: z.number().nonnegative(), refunded: z.number().nonnegative(), joinId: z.string().optional(), outbound: z.string(), inbound: z.string() });
const courseTrackSchema = z.object({fileName: z.string(), points: z.array(z.object({lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), ele: z.number().finite().optional()})).min(2).max(2000), segmentStarts: z.array(z.number().int().nonnegative()).optional(), elevationProfile: elevationProfileSchema.optional(), distanceKm: z.number().finite().nonnegative(), elevationGainM: z.number().finite().nonnegative().optional()}).superRefine((track, context) => {
  const starts = track.segmentStarts;
  if (starts !== undefined && (starts[0] !== 0 || starts.some((start, index) => start >= track.points.length || (index > 0 && start <= starts[index - 1]!)))) context.addIssue({code: 'custom', path: ['segmentStarts'], message: '트랙 구간은 0부터 시작하며 경로 지점 범위 안에서 순서대로 증가해야 합니다.'});
});
const courseSourceSchema = z.object({kind: z.enum(['saved-course', 'gpx', 'segments']), id: z.string().optional(), name: z.string().min(1).max(300), importedAt: z.number().finite().optional()});
const courseCheckpointSchema = z.object({name: z.string().trim().min(1).max(300), type: z.string().optional(), note: z.string().optional(), lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional(), distanceKm: z.number().finite().nonnegative().optional(), source: z.enum(['course', 'gpx', 'segments', 'manual']), segmentId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(), segmentEndpoint: z.enum(['start', 'end']).optional(), offTrackM: z.number().finite().nonnegative().optional()});
const stateSchema = z.object({ version: z.literal(1), clubManagerIds: z.array(z.string()).optional(), now: z.number().finite(), kinds: z.array(z.object({ id: z.string(), name: z.string(), active: z.boolean() })), members: z.array(z.object({ id: z.string(), name: z.string() })), meetings: z.array(z.object({ id: z.string(), kindName: z.string().max(80).optional(), hostId: z.string().min(1).optional(), courseSource: courseSourceSchema.optional(), courseCheckpoints: z.array(courseCheckpointSchema).max(100).optional(), kindId: z.string(), title: z.string(), date: z.string(), time: z.string(), place: z.string(), capacity: z.number().int().positive(), pace: z.string(), description: z.string(), courseInfoVersion: z.literal(1).optional(), segments: meetingSegmentsSchema.optional(), distanceKm: z.number().finite().nonnegative().optional(), elevationGainM: z.number().finite().nonnegative().optional(), courseHighlights: z.string().optional(), courseStops: z.array(z.string()).optional(), courseTrack: courseTrackSchema.optional(), courseReady: z.boolean(), fee: z.number().nonnegative(), joins: z.array(z.object({ id: z.string(), place: z.string(), time: z.string() })), parking: z.string(), weather: z.string(), status: z.enum(['open', 'cancelled']), recruitment: z.enum(['open', 'waitlist', 'closed']).optional(), registrations: z.array(registrationSchema), notices: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), targets: z.array(z.string()), confirmed: z.array(z.string()), at: z.number() })) })) });
export function parseMeetingDraft(value: unknown): Meeting { return stateSchema.shape.meetings.element.parse(value); }
export function loadLocal(): { state: State; error: string } {
  try { const raw = localStorage.getItem(STORAGE_KEY); return { state: raw ? expireOffers(withCourseInfo(stateSchema.parse(JSON.parse(raw)))) : createSeed(), error: '' }; }
  catch { return { state: createSeed(), error: '저장된 예시를 읽지 못했어요. 초기화하면 다시 시작할 수 있습니다.' }; }
}

function withCourseInfo(state: State): State {
  const seeds = createSeed().meetings;
  const oldNames: Record<string, string> = { host: '솔바람 · 주최자', me: '나래 · 나', next: '여울 · 대기회원' };
  const names: Record<string, string> = { host: '솔바람', me: '나래', next: '여울' };
  return {...state, members: state.members.map(member => member.name === oldNames[member.id] ? {...member, name: names[member.id]!} : member), meetings: state.meetings.map(meeting => {
    const seed = seeds.find(item => item.id === meeting.id);
    if (!seed || meeting.courseInfoVersion) return meeting;
    return {...meeting, courseInfoVersion: 1, distanceKm: meeting.distanceKm ?? seed.distanceKm, elevationGainM: meeting.elevationGainM ?? seed.elevationGainM, courseHighlights: meeting.courseHighlights ?? seed.courseHighlights, courseStops: meeting.courseStops ?? seed.courseStops};
  })};
}
