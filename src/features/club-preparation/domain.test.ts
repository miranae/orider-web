// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BASE_TIME, STORAGE_KEY, createSeed, duplicateMeeting, expireOffers, loadLocal, occupied, saveMeeting, meetingHostId, isMeetingHost, isClubManager, parseMeetingDraft, transition, updateKind } from './domain';
describe('동호회 모임 준비', () => {
  it('모임 종류를 추가·수정·비활성화해도 기존 참조를 유지한다', () => {
    let s = createSeed(); s = updateKind(s, 'host', { id: 'lesson', name: '교육', active: true });
    s = updateKind(s, 'host', { id: 'tour', name: '원정', active: false });
    expect(s.kinds).toHaveLength(3); expect(s.meetings[0].kindId).toBe('tour');
    expect(() => updateKind(s, 'me', { id: 'tour', name: '변경', active: true })).toThrow();
  });
  it('주최자를 포함해 정원을 계산하고 마지막 자리 신청을 순차 반영한다', () => {
    let s = createSeed(); s.meetings[2].capacity = 5;
    s = transition(s, { type: 'join', meetingId: 'gimpo', actor: 'next' });
    s = transition(s, { type: 'join', meetingId: 'gimpo', actor: 'r2' });
    expect(occupied(s.meetings[2])).toBe(5); expect(s.meetings[2].registrations.at(-1)?.status).toBe('waiting');
    expect(occupied(createSeed().meetings[0])).toBe(18);
  });
  it('취소·자리 제안·본인 수락을 구분하고 기존 대기자를 우회하지 않는다', () => {
    let s = createSeed(); s = transition(s, { type: 'cancel', meetingId: 'recovery', actor: 'r0' });
    s = transition(s, { type: 'join', meetingId: 'recovery', actor: 'r19' });
    expect(s.meetings[1].registrations.at(-1)?.status).toBe('waiting');
    s = transition(s, { type: 'offer', meetingId: 'recovery', actor: 'host', target: 'me' });
    expect(s.meetings[1].registrations.find(r => r.memberId === 'me')?.status).toBe('offered');
    expect(() => transition(expireOffers(s, BASE_TIME + 31 * 60000), { type: 'accept', meetingId: 'recovery', actor: 'me' })).toThrow();
    expect(expireOffers(s, BASE_TIME + 31 * 60000).meetings[1].registrations.find(r => r.memberId === 'me')?.status).toBe('waiting');
    s = transition(s, { type: 'accept', meetingId: 'recovery', actor: 'me' });
    expect(s.meetings[1].registrations.find(r => r.memberId === 'me')?.status).toBe('joined');
  });
  it('취소 후 입금 대조와 환불 기록을 별도로 처리하고 중복 환불을 막는다', () => {
    let s = createSeed(); s = transition(s, { type: 'report', meetingId: 'jeongseon', actor: 'me', text: '나래' });
    s = transition(s, { type: 'cancel', meetingId: 'jeongseon', actor: 'me' });
    s = transition(s, { type: 'confirmPayment', meetingId: 'jeongseon', actor: 'host', target: 'me' });
    const r = () => s.meetings[0].registrations.find(r => r.memberId === 'me')!;
    expect(r().refundDue).toBe(80000); expect(r().status).toBe('cancelled');
    expect(() => transition(s, { type: 'refund', meetingId: 'jeongseon', actor: 'me' })).toThrow();
    s = transition(s, { type: 'refund', meetingId: 'jeongseon', actor: 'host', target: 'me' });
    expect(r().refundDue).toBe(0); expect(r().refunded).toBe(80000);
    expect(() => transition(s, { type: 'cancel', meetingId: 'jeongseon', actor: 'me' })).toThrow();
    expect(() => transition(s, { type: 'join', meetingId: 'jeongseon', actor: 'me' })).toThrow();
  });
  it('전체 취소는 현재 명단에 공지하고 충원을 막지만 입금 대조를 허용한다', () => {
    let s = createSeed(); s = transition(s, { type: 'report', meetingId: 'jeongseon', actor: 'me', text: '나래' });
    s = transition(s, { type: 'cancelMeeting', meetingId: 'jeongseon', actor: 'host', text: '우천' });
    expect(s.meetings[0].notices[0].targets).toHaveLength(19);
    expect(s.meetings[0].registrations[0].refundDue).toBe(80000);
    expect(() => transition(s, { type: 'join', meetingId: 'jeongseon', actor: 'r19' })).toThrow();
    expect(() => transition(s, { type: 'offer', meetingId: 'jeongseon', actor: 'host', target: 'next' })).toThrow();
    s = transition(s, { type: 'confirmPayment', meetingId: 'jeongseon', actor: 'host', target: 'me' });
    s = transition(s, { type: 'ack', meetingId: 'jeongseon', actor: 'next', noticeId: s.meetings[0].notices[0].id });
    expect(s.meetings[0].notices[0].confirmed).toContain('next');
  });
  it('복사는 개인정보·원장·공지 확인을 복사하지 않고 저장 시 최신 명단을 보존한다', () => {
    let s = createSeed(); const draft = structuredClone(s.meetings[2]);
    const copied = duplicateMeeting(s.meetings[0], 'new');
    expect(copied.registrations).toEqual([]); expect(copied.notices).toEqual([]);
    s = transition(s, { type: 'join', meetingId: 'gimpo', actor: 'next' });
    s = saveMeeting(s, 'host', { ...draft, title: '수정' });
    expect(s.meetings[2].registrations.some(r => r.memberId === 'next')).toBe(true);
    expect(() => saveMeeting(s, 'host', { ...s.meetings[0], fee: 1 })).toThrow();
    s = saveMeeting(s, 'host', copied); expect(s.meetings[0].registrations[0].memberId).toBe('host');
  });
  it('설정 변경은 현재 대상자에게 변경 공지를 남기고 합류·권한을 검증한다', () => {
    let s = createSeed(); const m = s.meetings[2];
    expect(() => saveMeeting(s, 'me', m)).toThrow();
    expect(() => saveMeeting(s, 'host', { ...m, joins: [] })).toThrow();
    expect(() => transition(s, { type: 'travel', meetingId: 'gimpo', actor: 'me', joinId: 'missing' })).toThrow();
    expect(() => transition(s, { type: 'travel', meetingId: 'gimpo', actor: 'me', target: 'host' })).toThrow();
    s = saveMeeting(s, 'host', { ...m, place: '새 집결지' });
    expect(s.meetings[2].notices[0].targets).toContain('me');
    expect(s.meetings[2].notices[0].body).toContain('새 집결지');
    s = updateKind(s, 'host', { id: 'tour', name: '투어', active: false });
    expect(() => saveMeeting(s, 'host', duplicateMeeting(m, 'inactive'))).toThrow();
    expect(() => saveMeeting(s, 'host', s.meetings[2])).not.toThrow();
  });
  it('손상된 저장 데이터는 화면을 깨뜨리지 않고 초기화를 안내한다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createSeed(), meetings: [{ title: '깨짐' }] }));
    expect(loadLocal().error).toContain('초기화'); localStorage.removeItem(STORAGE_KEY);
  });
  it('모집 상태는 정원과 별개로 제어하고 마감 후 기존 대기 충원을 허용한다', () => {
    let s = createSeed();
    expect(() => transition(s, { type: 'recruitment', meetingId: 'gimpo', actor: 'me', text: 'closed' })).toThrow('주최자');
    expect(() => transition(s, { type: 'recruitment', meetingId: 'gimpo', actor: 'host', text: 'invalid' })).toThrow('모집 상태');
    s = transition(s, { type: 'recruitment', meetingId: 'gimpo', actor: 'host', text: 'waitlist' });
    expect(s.meetings[2].notices[0].targets).toEqual(['host', 'me', 'r0', 'r1']);
    s = transition(s, { type: 'join', meetingId: 'gimpo', actor: 'next' });
    expect(s.meetings[2].registrations.at(-1)?.status).toBe('waiting');
    s = transition(s, { type: 'recruitment', meetingId: 'gimpo', actor: 'host', text: 'closed' });
    expect(() => transition(s, { type: 'join', meetingId: 'gimpo', actor: 'r2' })).toThrow('마감');
    s = transition(s, { type: 'offer', meetingId: 'gimpo', actor: 'host', target: 'next' });
    s = transition(s, { type: 'accept', meetingId: 'gimpo', actor: 'next' });
    expect(s.meetings[2].registrations.at(-1)?.status).toBe('joined');
    const staleEdit = {...s.meetings[2], recruitment: 'open' as const};
    s = saveMeeting(s, 'host', staleEdit);
    expect(s.meetings[2].recruitment).toBe('closed');
    s = transition(s, { type: 'recruitment', meetingId: 'gimpo', actor: 'host', text: 'open' });
    s = transition(s, { type: 'join', meetingId: 'gimpo', actor: 'r2' });
    expect(s.meetings[2].registrations.at(-1)?.status).toBe('joined');
  });
  it('변경한 운영 안내만 전후 비교하고 취소자를 공지 대상에서 제외한다', () => {
    let s = transition(createSeed(), { type: 'cancel', meetingId: 'gimpo', actor: 'r0' });
    const before = s.meetings[2];
    s = saveMeeting(s, 'host', { ...before, pace: '25km/h', weather: '토요일 17시 판단', courseHighlights: '새 보급소', description: '카페 대신 편의점' });
    const notice = s.meetings[2].notices[0];
    expect(notice.body).toContain(`${before.pace} → 25km/h`);
    expect(notice.body).toContain('우천·진행 판단: 미정 → 토요일 17시 판단');
    expect(notice.body).toContain('새 보급소');
    expect(notice.body).toContain(`${before.description} → 카페 대신 편의점`);
    expect(notice.body).not.toContain('출발 일시');
    expect(notice.body).not.toContain('집결 장소');
    expect(notice.targets).not.toContain('r0');
    const unchanged = saveMeeting(s, 'host', s.meetings[2]);
    expect(unchanged.meetings[2].notices).toHaveLength(1);
  });
  it('복사한 주차·코스 자료는 재사용하되 새 일시와 코스 확정을 요구한다', () => {
    const s = createSeed();
    const source = {...s.meetings[2], weather: '이전 우천 안내', recruitment: 'closed' as const};
    const copy = duplicateMeeting(source, 'next-ride');
    expect(copy.parking).toBe(source.parking);
    expect(copy.courseStops).toEqual(source.courseStops);
    expect(copy.weather).toBe(''); expect(copy.courseReady).toBe(false); expect(copy.recruitment).toBe('open');
    expect(() => saveMeeting(s, 'host', {...copy, date: '2026-10-17'})).toThrow('현재 시각 이후');
    expect(() => saveMeeting(s, 'host', {...copy, date: 'bad-date'})).toThrow('현재 시각 이후');
    const past = {...s, now: Date.parse('2026-10-26T09:00:00+09:00')};
    expect(() => saveMeeting(past, 'host', {...source, description: '지난 모임 메모'})).not.toThrow();
    expect(() => saveMeeting(past, 'host', {...source, time: '07:00'})).toThrow('현재 시각 이후');
  });

  it('모임을 만든 회원이 해당 모임의 주최자가 되고 다른 모임의 권한은 얻지 않는다', () => {
    let s = createSeed();
    const draft = duplicateMeeting(s.meetings[2], 'mine');
    expect(draft.hostId).toBeUndefined();
    s = saveMeeting(s, 'me', {...draft, hostId: 'host'});
    const mine = s.meetings[0];
    expect(meetingHostId(mine)).toBe('me');
    expect(isMeetingHost(mine, 'me')).toBe(true);
    expect(mine.registrations.map(r => r.memberId)).toEqual(['me']);
    expect(isMeetingHost(s.meetings.find(m => m.id === 'gimpo')!, 'me')).toBe(false);
    expect(() => saveMeeting(s, 'host', {...mine, title: '관리자 우회'})).toThrow('주최자');
    expect(() => saveMeeting(s, 'next', {...mine, hostId: 'next'})).toThrow('주최자');
    expect(() => saveMeeting(s, 'me', {...mine, hostId: 'next'})).toThrow('변경할 수 없습니다');
    expect(() => transition(s, { type: 'notice', actor: 'host', meetingId: 'mine', text: '우회' })).toThrow('주최자');
    expect(() => transition(s, { type: 'recruitment', actor: 'me', meetingId: 'gimpo', text: 'closed' })).toThrow('주최자');
    s = transition(s, { type: 'notice', actor: 'me', meetingId: 'mine', text: '내 모임 안내' });
    expect(s.meetings[0].notices[0].body).toBe('내 모임 안내');
    expect(() => saveMeeting(s, 'unknown', {...draft, id: 'unknown'})).toThrow('등록된 회원');
  });
  it('다른 모임에선 본인 참석만 관리하고 주최자도 타인의 개인 응답을 대신하지 않는다', () => {
    let s = saveMeeting(createSeed(), 'me', duplicateMeeting(createSeed().meetings[2], 'mine'));
    s = transition(s, { type: 'join', actor: 'next', meetingId: 'mine' });
    for (const type of ['cancel', 'report', 'travel', 'accept', 'join'] as const) {
      expect(() => transition(s, { type, actor: 'me', target: 'next', meetingId: 'mine', text: '위조' })).toThrow('본인의 신청');
    }
    s = transition(s, { type: 'cancel', actor: 'me', meetingId: 'gimpo' });
    expect(s.meetings.find(m => m.id === 'gimpo')!.registrations.find(r => r.memberId === 'me')?.status).toBe('cancelled');
    expect(s.meetings[0].registrations.find(r => r.memberId === 'me')?.status).toBe('joined');
    expect(() => transition(s, { type: 'cancelMeeting', actor: 'me', meetingId: 'gimpo', text: '권한 없음' })).toThrow('주최자');
  });
  it('클럽 관리자와 모임 주최자를 구분하고 기존 저장 데이터·초안을 호환한다', () => {
    let s = createSeed();
    expect(isClubManager(s, 'host')).toBe(true); expect(isClubManager(s, 'me')).toBe(false);
    s = saveMeeting(s, 'me', duplicateMeeting(s.meetings[2], 'mine'));
    expect(() => updateKind(s, 'me', {id: 'lesson', name: '교육', active: true})).toThrow('클럽 관리자');
    s = {...s, clubManagerIds: ['next']};
    expect(isClubManager(s, 'host')).toBe(false); expect(isClubManager(s, 'next')).toBe(true);
    expect(() => updateKind(s, 'host', {id: 'lesson', name: '교육', active: true})).toThrow('클럽 관리자');
    expect(updateKind(s, 'next', {id: 'lesson', name: '교육', active: true}).kinds).toHaveLength(3);
    const legacy = createSeed(); delete legacy.clubManagerIds;
    legacy.meetings.forEach(meeting => { delete meeting.hostId; });
    expect(meetingHostId(legacy.meetings[0])).toBe('host'); expect(isClubManager(legacy, 'host')).toBe(true);
    expect(parseMeetingDraft(legacy.meetings[0]).hostId).toBeUndefined();
    expect(saveMeeting(legacy, 'host', legacy.meetings[0]).meetings[0].hostId).toBe('host');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(loadLocal().error).toBe(''); expect(meetingHostId(loadLocal().state.meetings[0])).toBe('host');
    localStorage.removeItem(STORAGE_KEY);
  });

  it('이전 예시의 역할이 붙은 이름만 정리하고 직접 바꾼 이름을 보존한다', () => {
    const legacy = createSeed();
    legacy.members.find(member => member.id === 'host')!.name = '솔바람 · 주최자';
    legacy.members.find(member => member.id === 'me')!.name = '나래 · 나';
    legacy.members.find(member => member.id === 'next')!.name = '새 이름';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(loadLocal().state.members.slice(0, 3).map(member => member.name)).toEqual(['솔바람', '나래', '새 이름']);
    localStorage.removeItem(STORAGE_KEY);
    expect(createSeed().members.slice(0, 3).map(member => member.name)).toEqual(['솔바람', '나래', '여울']);
  });

  it('저장 payload로 취소·소유권·참석 명단을 위조할 수 없다', () => {
    let s = createSeed();
    const draft = {...duplicateMeeting(s.meetings[2], 'mine'), status: 'cancelled' as const, hostId: 'host', registrations: s.meetings[2].registrations};
    s = saveMeeting(s, 'me', draft);
    expect(s.meetings[0].status).toBe('open'); expect(s.meetings[0].hostId).toBe('me');
    expect(s.meetings[0].registrations.map(r => r.memberId)).toEqual(['me']);
    s = saveMeeting(s, 'me', {...s.meetings[0], status: 'cancelled', registrations: []});
    expect(s.meetings[0].status).toBe('open'); expect(s.meetings[0].registrations.map(r => r.memberId)).toEqual(['me']);
    expect(s.meetings[0].notices).toEqual([]);
    s = transition(s, {type: 'cancelMeeting', actor: 'me', meetingId: 'mine', text: '우천 취소'});
    expect(s.meetings[0].status).toBe('cancelled'); expect(s.meetings[0].notices[0].body).toBe('우천 취소');
    expect(() => saveMeeting(s, 'me', {...s.meetings[0], status: 'open'})).toThrow('취소된 모임');
  });

  it('분리 트랙 시작점은 저장과 복원에서 같은 경계 규칙을 검증한다', () => {
    const state = createSeed();
    const points = [37, 37.001, 38, 38.001].map(lat => ({lat, lon: 127}));
    const track = {fileName: 'split.gpx', points, distanceKm: .222};
    for (const segmentStarts of [undefined, [0], [0, 2]]) {
      const saved = saveMeeting(state, 'host', {...state.meetings[2], courseTrack: {...track, segmentStarts}});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      expect(loadLocal().error).toBe('');
      expect(loadLocal().state.meetings[2].courseTrack?.segmentStarts).toEqual(segmentStarts);
    }
    for (const segmentStarts of [[], [1], [0, 0], [0, 3, 2], [0, 4], [0, -1], [0, .5]]) {
      expect(() => saveMeeting(state, 'host', {...state.meetings[2], courseTrack: {...track, segmentStarts}})).toThrow();
      const corrupted = structuredClone(state);
      corrupted.meetings[2].courseTrack = {...track, segmentStarts};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(corrupted));
      expect(loadLocal().error).toContain('초기화');
      expect(() => parseMeetingDraft(corrupted.meetings[2])).toThrow();
    }
    expect(() => saveMeeting(state, 'host', {...state.meetings[2], courseTrack: {...track, points: [{lat: 91, lon: 127}, points[1]!]}})).toThrow();
    localStorage.removeItem(STORAGE_KEY);
  });

});
