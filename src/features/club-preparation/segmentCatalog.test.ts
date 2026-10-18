// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrichSegmentChoice, loadSegmentCatalog, parseSegmentCatalog, searchSegments, segmentDetailHref, segmentDistance, selectSegment } from './segmentCatalog';
import { createSeed, duplicateMeeting, loadLocal, saveMeeting, STORAGE_KEY } from './domain';
const choice = { id: 'native_test', name: '가을 고개', city: '정선', distance: 2400, averageGrade: 4.2 };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('기존 공개 세그먼트 연결', () => {
  it('실제 overview sl의 위도·경도와 상세 누적 획고를 가져오되 고저차는 사용하지 않는다', () => {
    const segment = parseSegmentCatalog({segments:[{...choice, sl:[[37,127],[37.1,127.1]]}]})[0]!;
    expect(segment.geometry).toEqual([{lat:37,lon:127},{lat:37.1,lon:127.1}]);
    expect(enrichSegmentChoice(segment,{elevationGain:0,elevationHigh:200,elevationLow:100})?.elevationGain).toBe(0);
    expect(enrichSegmentChoice(segment,{elevationHigh:200,elevationLow:100})?.elevationGain).toBeUndefined();
    expect(enrichSegmentChoice(segment,{hidden:true})).toBeNull();
    expect(enrichSegmentChoice(segment,{segmentLatlng:'[[37,127],[37.2,127.2]]'})?.geometry?.[1]).toEqual({lat:37.2,lon:127.2});
    expect(parseSegmentCatalog({segments:[{...choice,sl:[[91,127],[37,127]]}]})[0]?.geometry).toBeUndefined();
  });
  it('저장된 실측 고도 샘플만 거리 순서대로 보존하고 지도 좌표에 임의 고도를 붙이지 않는다', () => {
    const profile = [{distance:0,elevation:0,lat:37,lon:127},{distance:500,elevation:20,lat:37.01,lon:127.01},{distance:1000,elevation:0,lat:37.02,lon:127.02}];
    const segment = enrichSegmentChoice(choice,{elevationProfile:profile, segmentLatlng:'[[37,127],[37.02,127.02]]'})!;
    expect(segment.elevationProfile).toEqual([{distance:0,elevation:0},{distance:500,elevation:20},{distance:1000,elevation:0}]);
    expect(segment.geometry?.every(point=>point.ele===undefined)).toBe(true);
    expect(enrichSegmentChoice(choice,{elevationProfile:[profile[1],profile[0]]})?.elevationProfile).toBeUndefined();
    expect(enrichSegmentChoice(choice,{elevationProfile:[profile[0],{distance:500,elevation:NaN}]})?.elevationProfile).toBeUndefined();
    expect(enrichSegmentChoice(choice,{elevationHigh:100,elevationLow:0})?.elevationProfile).toBeUndefined();
  });
  it('실제 타일의 고저차를 획득고도로 만들지 않고 이름과 지역을 검색한다', () => {
    const catalog = parseSegmentCatalog({ segments: [{ ...choice, elevationHigh: 800, elevationLow: 300 }, { ...choice }, { id: '../unsafe', name: 'bad' }, { id: 'missing-metrics', name: '수치 미확인' }] });
    expect(catalog).toHaveLength(2); expect(catalog[0]?.elevationGain).toBeUndefined();
    expect(searchSegments(catalog, '정선 가을')).toHaveLength(1);
    expect(segmentDistance(choice)).toBe('2.4 km'); expect(segmentDistance(catalog[1]!)).toBe('—');
    expect(() => segmentDetailHref('javascript:alert(1)')).toThrow();
    expect(segmentDetailHref(choice.id)).toBe('/ko/segment/native_test');
  });
  it('선택 중복을 막고 저장·복사·재로드와 변경 공지에 선택 구간을 보존한다', () => {
    const selected = selectSegment([], choice); expect(() => selectSegment(selected, choice)).toThrow();
    let s = createSeed(); s = saveMeeting(s, 'host', { ...s.meetings[2]!, segments: selected });
    expect(s.meetings[2]?.notices[0]?.body).toContain('가을 고개');
    expect(duplicateMeeting(s.meetings[2]!, 'copy').segments).toEqual(selected);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    expect(loadLocal().state.meetings[2]?.segments).toEqual(selected);
    expect(() => saveMeeting(s, 'host', { ...s.meetings[2]!, segments: [selected[0]!, selected[0]!] })).toThrow();
  });
  it('같은 구간의 진행 방식과 설명 변경을 알리고 변경 없는 거리는 반복하지 않는다', () => {
    let state = createSeed();
    state = saveMeeting(state, 'host', { ...state.meetings[0]!, segments: selectSegment([], choice) });
    const meeting = state.meetings[0]!;
    state = saveMeeting(state, 'host', { ...meeting, segments: meeting.segments!.map(segment => ({ ...segment, mode: '오픈', instruction: '정상에서 재집결해요.' })) });
    const body = state.meetings[0]!.notices[0]!.body;
    expect(body).toContain('가을 고개 (함께)');
    expect(body).toContain('가을 고개 (오픈 · 정상에서 재집결해요.)');
    expect(body).not.toContain('거리:');
  });
  it('기존 정적 JSON 조회를 사용하고 실패를 호출자에게 전달한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ segments: [choice] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await loadSegmentCatalog()).toEqual([choice]);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/__club-segments/overview.json');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(loadSegmentCatalog()).rejects.toThrow();
  });
});
