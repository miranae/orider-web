// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSeed, loadLocal, saveMeeting, STORAGE_KEY } from './domain';
import { applyCoursePlan, readGpxCoursePlan, readSegmentCoursePlan } from './meetingCoursePlan';
import { meetingSegmentsSchema, selectSegment } from './segmentCatalog';
const segment = (elevations?: number[], latitude = 37) => `<trkseg>${[0, 1, 2, 3].map((step) => `<trkpt lat="${latitude + step * .001}" lon="127">${elevations ? `<ele>${elevations[step]}</ele>` : ''}</trkpt>`).join('')}</trkseg>`;
const gpx = (track: string, extra = '') => `<gpx>${extra}<trk><name>한 바퀴</name>${track}</trk></gpx>`;

describe('모임 코스 가져오기', () => {
  it('고도 있는 GPX는 원본 수치·전체 주행 구간·오르막 경로를 자동 생성한다', () => {
    const xml = gpx(segment([50, 100, 170, 120]));
    const plan = readGpxCoursePlan(xml, 'ride.gpx');
    expect(plan.source).toMatchObject({kind: 'gpx', name: '한 바퀴'});
    expect(plan.distanceKm).toBeGreaterThan(.3);
    expect(plan.elevationGainM).toBe(120);
    expect(plan.segments.map(s => s.segmentKind)).toEqual(['route', 'climb']);
    expect(plan.segments[1]).toMatchObject({elevationGain: 120, climbCategory: 1, source: 'gpx'});
    expect(plan.segments[1]!.geometry).toHaveLength(3);
    expect(readGpxCoursePlan(xml, '다른 파일명.gpx').segments.map(s => s.id)).toEqual(plan.segments.map(s => s.id));
    expect(meetingSegmentsSchema.safeParse(plan.segments).success).toBe(true);
  });
  it('고도 누락과 실제 평지 0을 구별하고 근거 없는 보급소를 만들지 않는다', () => {
    const flat = readGpxCoursePlan(gpx(segment([20, 20, 20, 20])), 'flat.gpx');
    const missing = readGpxCoursePlan(gpx(segment()), 'missing.gpx');
    expect(flat.elevationGainM).toBe(0); expect(flat.segments).toHaveLength(1);
    expect(missing.elevationGainM).toBeUndefined(); expect(missing.segments[0]!.elevationGain).toBeUndefined();
    expect(missing.segments[0]!.geometry![0]!.ele).toBeUndefined();
    expect(missing.checkpoints.map(p => p.name)).toEqual(['출발', '도착']);
  });
  it('분리 트랙을 잇지 않고 실제 wpt를 거리순으로 가져오며 rtept를 제외한다', () => {
    const xml = gpx(segment([50, 50, 50, 50]) + segment([2000, 2000, 2000, 2000], 38), '<wpt lat="38.002" lon="127"><name>쉼터</name></wpt><wpt lat="37.001" lon="127"><name>쉼터</name></wpt><wpt lat="39" lon="127"><name>외부 장소</name></wpt><wpt lat="99" lon="127"><name>잘못된 좌표</name></wpt><rte><rtept lat="37.002" lon="127"><name>제어점</name></rtept></rte>');
    const plan = readGpxCoursePlan(xml, 'split.gpx');
    expect(plan.distanceKm).toBeLessThan(1); expect(plan.elevationGainM).toBe(0);
    expect(plan.segments).toHaveLength(2); expect(plan.track!.segmentStarts).toEqual([0, 4]);
    expect(plan.checkpoints.map(p => p.name)).toEqual(['출발', '쉼터', '쉼터', '외부 장소', '도착']);
    expect(plan.checkpoints[1]!.distanceKm).toBeLessThan(plan.checkpoints[2]!.distanceKm!);
    expect(plan.checkpoints[3]!.offTrackM).toBeGreaterThan(10000);
  });
  it('적용은 기존 소유자·신청·공지·정원을 보존하고 저장·재읽기를 지원한다', () => {
    const state = createSeed();
    const meeting = state.meetings[2]!;
    const before = structuredClone(meeting);
    const plan = readGpxCoursePlan(gpx(segment([20, 20, 20, 20])), 'test.gpx');
    const applied = applyCoursePlan(meeting, plan);
    expect(applied.id).toBe(meeting.id); expect(applied.hostId).toBe(meeting.hostId);
    expect(applied.registrations).toEqual(meeting.registrations); expect(applied.notices).toEqual(meeting.notices); expect(applied.capacity).toBe(meeting.capacity);
    expect(meeting).toEqual(before); expect(applied.courseStops).toEqual(['출발', '도착']);
    plan.checkpoints[0]!.name = '변형'; expect(applied.courseCheckpoints![0]!.name).toBe('출발');
    const saved = saveMeeting(state, 'host', applied);
    expect(saved.meetings[2]!.notices[0]!.body).toContain('체크포인트');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadLocal().error).toBe(''); expect(loadLocal().state.meetings[2]!.courseSource?.kind).toBe('gpx');
    localStorage.removeItem(STORAGE_KEY);
  });
  it('선택 구간 합계·실제 출발과 도착을 순서대로 가져오며 원본을 변경하지 않는다', () => {
    const first = {...selectSegment([], {id:'first', name:'강변', distance:3200, elevationGain:0})[0]!, geometry:[{lat:37,lon:127},{lat:37.01,lon:127.01}]};
    const second = {...first, id:'second',name:'언덕',distance:1800,elevationGain:120};
    const plan=readSegmentCoursePlan([first,second]);
    expect(plan).toMatchObject({distanceKm:5,elevationGainM:120,source:{kind:'segments'}});
    expect(plan.checkpoints.map(point=>[point.name,point.distanceKm])).toEqual([['강변 · 출발',0],['강변 · 도착',3.2],['언덕 · 출발',3.2],['언덕 · 도착',5]]);
    expect(plan.checkpoints[0]).toMatchObject({lat:37,lon:127,source:'segments'});
    expect(plan.track).toBeUndefined();
    expect(readSegmentCoursePlan([second,first]).checkpoints[0]!.name).toBe('언덕 · 출발');
    expect(readSegmentCoursePlan([first])).toMatchObject({distanceKm:3.2,elevationGainM:0});
    expect(readSegmentCoursePlan([])).toMatchObject({distanceKm:undefined,elevationGainM:undefined,checkpoints:[]});
    plan.segments[0]!.name='다른 이름'; expect(first.name).toBe('강변');
    const state=createSeed(); const saved=saveMeeting(state,'host',applyCoursePlan(state.meetings[2]!,readSegmentCoursePlan([first,second])));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
    expect(loadLocal().error).toBe(''); expect(loadLocal().state.meetings[2]!.courseCheckpoints![3]!.distanceKm).toBe(5);
    localStorage.removeItem(STORAGE_KEY);
  });
  it('구간의 누락된 거리·획고·좌표를 추정하지 않고 이후 누적 거리도 미정으로 남긴다', () => {
    const first=selectSegment([],{id:'first',name:'정보 없음'})[0]!;
    const second={...first,id:'second',name:'뒤 구간',distance:1000,elevationGain:0,geometry:[{lat:37,lon:127,ele:0},{lat:37.01,lon:127.01,ele:999}]};
    const plan=readSegmentCoursePlan([first,second]);
    expect(plan.distanceKm).toBeUndefined();expect(plan.elevationGainM).toBeUndefined();
    expect(plan.checkpoints).toHaveLength(2);expect(plan.checkpoints[0]!.distanceKm).toBeUndefined();expect(plan.checkpoints[1]!.distanceKm).toBeUndefined();
    expect(readSegmentCoursePlan([second]).elevationGainM).toBe(0);
    expect(plan.warnings?.join(' ')).toContain('좌표가 없는');
  });

  it('공개 세그먼트 선택 상한은 자동 생성 구간 수와 별도로 적용한다', () => {
    const generated = readGpxCoursePlan(gpx(segment()), 'test.gpx').segments;
    let selected = generated;
    for (let index = 0; index < 12; index++) selected = selectSegment(selected, {id: `public-${index}`, name: `공개 ${index}`});
    expect(selected).toHaveLength(13); expect(meetingSegmentsSchema.safeParse(selected).success).toBe(true);
    expect(() => selectSegment(selected, {id: 'extra', name: '추가'})).toThrow('12개');
  });
  it('자동 구간·체크포인트 상한을 지키고 생략 내용을 명시한다', () => {
    const points = Array.from({length: 180}, (_, index) => `<trkpt lat="${37 + index * .0001}" lon="127"><ele>${index % 3 === 1 ? 120 : 0}</ele></trkpt>`).join('');
    const waypoints = Array.from({length: 101}, (_, index) => `<wpt lat="37.001" lon="127"><name>장소 ${index}</name></wpt>`).join('');
    const plan = readGpxCoursePlan(gpx(`<trkseg>${points}</trkseg>`, waypoints), 'many.gpx');
    expect(plan.segments.filter(s => s.segmentKind === 'climb')).toHaveLength(50);
    expect(plan.checkpoints).toHaveLength(100);
    expect(plan.warnings?.join(' ')).toContain('첫 50개'); expect(plan.warnings?.join(' ')).toContain('첫 100개');
    expect(meetingSegmentsSchema.safeParse(plan.segments).success).toBe(true);
    expect(() => readGpxCoursePlan(gpx(Array.from({length: 51}, () => segment()).join('')), 'too-many.gpx')).toThrow();
  });

  it('긴 GPX 체크포인트 이름을 정리해 저장 가능한 길이로 가져온다', () => {
    const plan = readGpxCoursePlan(gpx(segment([10,20,30,40]), `<wpt lat="37.001" lon="127"><name>  ${'가'.repeat(301)}  </name></wpt>`), 'long-name.gpx');
    expect(plan.checkpoints[1]!.name).toBe('가'.repeat(300));
    const state=createSeed();const meeting=applyCoursePlan(state.meetings[2]!,plan);
    expect(()=>saveMeeting(state,'host',meeting)).not.toThrow();
  });

});
