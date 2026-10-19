// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCourseTrack, readCourseTrackData, projectCourseTrack } from './courseTrackPreview';
import { createSeed, loadLocal, saveMeeting, STORAGE_KEY } from './domain';

afterEach(() => localStorage.clear());
const segment = (lat: number, elevation?: number) => `<trkseg><trkpt lat="${lat}" lon="127">${elevation === undefined ? '' : `<ele>${elevation}</ele>`}</trkpt><trkpt lat="${lat + .001}" lon="127.001">${elevation === undefined ? '' : `<ele>${elevation}</ele>`}</trkpt></trkseg>`;

describe('모집 코스 안내', () => {
  it('GPX 고도 정보 없음과 실제 획득고도 0을 구분한다', () => {
    const missing = readCourseTrack(`<gpx><trk>${segment(37)}</trk></gpx>`, '고도없음.gpx');
    const flat = readCourseTrack(`<gpx><trk>${segment(37, 50)}</trk></gpx>`, '평지.gpx');
    expect(missing.distanceKm).toBeGreaterThan(0);
    expect(missing.elevationGainM).toBeUndefined();
    expect(flat.elevationGainM).toBe(0);
  });
  it('분리된 트랙 구간 사이에 거리나 지도 연결선을 만들어내지 않는다', () => {
    const track = readCourseTrack(`<gpx><trk>${segment(37)}${segment(38)}</trk></gpx>`, '두구간.gpx');
    expect(track.distanceKm).toBeLessThan(1);
    expect(track.segmentStarts).toEqual([0, 2]);
    expect(projectCourseTrack(track).path.match(/M/g)).toHaveLength(2);
  });
  it('올바르지 않은 파일과 좌표·단일 지점을 거부한다', () => {
    expect(() => readCourseTrack('<gpx><trk>', '손상.gpx')).toThrow();
    expect(() => readCourseTrack('<gpx><trk><trkseg><trkpt lat="91" lon="127"/><trkpt lat="37" lon="127"/></trkseg></trk></gpx>', '잘못된좌표.gpx')).toThrow();
    expect(() => readCourseTrack('<gpx><trk><trkseg><trkpt lat="37" lon="127"/></trkseg></trk></gpx>', '한점.gpx')).toThrow();
  });
  it('거리·획득고도를 수정하면 기존 참석·대기자에게 변경 확인을 요청한다', () => {
    const state = createSeed();
    const meeting = state.meetings[0]!;
    const next = saveMeeting(state, 'host', { ...meeting, distanceKm: 102, elevationGainM: 1100 });
    expect(next.meetings[0]!.notices[0]!.targets).toContain('next');
    expect(next.meetings[0]!.notices[0]!.body).toContain('100km → 102km');
    expect(next.meetings[0]!.notices[0]!.body).toContain('1000m → 1100m');
    expect(next.meetings[0]!.distanceKm).toBe(102);
    expect(() => saveMeeting(state, 'host', { ...meeting, elevationGainM: -1 })).toThrow();
  });
  it('기존 예시의 안내 수치를 보강하되 새로 미정으로 설정한 값은 되돌리지 않는다', () => {
    const state = createSeed();
    delete state.meetings[0]!.courseInfoVersion;
    delete state.meetings[0]!.distanceKm;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    expect(loadLocal().state.meetings[0]!.distanceKm).toBe(100);
    state.meetings[0]!.courseInfoVersion = 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    expect(loadLocal().state.meetings[0]!.distanceKm).toBeUndefined();
  });
});


describe('GPX XML 텍스트 보안', () => {
  it('entity·CDATA는 텍스트로 유지하고 구간·경유지를 한 번 파싱한 DOM에서 읽는다', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const serialize = vi.spyOn(XMLSerializer.prototype, 'serializeToString').mockImplementation(() => { throw new Error('XML 재파싱 금지'); });
    try {
      const encoded = '&lt;img src=x onerror=alert(1)&gt; &amp; 단풍';
      const cdata = '<svg onload="alert(2)"><trkpt lat="0" lon="0"/></svg>';
      const result = readCourseTrackData(`<gpx><metadata><name>${encoded}</name></metadata>
        <wpt lat="37" lon="127"><name><![CDATA[${cdata}]]></name><type>AID</type></wpt>
        <wpt lat="91" lon="127"><name>잘못된 좌표</name></wpt>
        <trk>${segment(37, 100)}${segment(38, 200)}</trk></gpx>`, '보안.gpx');
      expect(parse).not.toHaveBeenCalled();
      expect(serialize).not.toHaveBeenCalled();
      expect(result.name).toBe('<img src=x onerror=alert(1)> & 단풍');
      expect(result.waypoints).toEqual([{lat:37,lon:127,ele:0,name:cdata,type:'AID'}]);
      expect(result.parts.map(part => part.points.length)).toEqual([2,2]);
      expect(result.track.segmentStarts).toEqual([0,2]);
      expect(result.track.points).toHaveLength(4);
      expect(result.track.distanceKm).toBeLessThan(1);
      expect(document.querySelector('img,svg[onload]')).toBeNull();
    } finally { parse.mockRestore(); serialize.mockRestore(); }
  });
});
