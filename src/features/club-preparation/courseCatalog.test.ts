// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { COURSE_CATALOG_FIELDS, loadCourseCatalogPage, loadSavedCourse, parseSavedCourse, toCoursePlan } from './courseCatalog';
const mocks = vi.hoisted(() => ({ runCourseListQuery: vi.fn(), loadCourseSource: vi.fn() }));
vi.mock('../../services/firebase', () => ({ getFirebaseApp: () => ({}), initFirebase: vi.fn(), firestore: {}, auth: {}, getAppCheckToken: vi.fn() }));
vi.mock('../courses/courseListRest', () => ({ runCourseListQuery: mocks.runCourseListQuery }));
vi.mock('../courses/courseDetailAsset', () => ({ loadCourseSource: mocks.loadCourseSource }));
const source = { name: '동강 가을길', visibility: 'public', deletedAt: null, distance: 100000, elevationGain: 0, trackPoints: [{lat:37,lon:128,alt:0},{lat:37.01,lon:128.01,alt:0}], waypoints: [{name:'카페',type:'supply',note:'물 보충',latitude:37.01,longitude:128.01,distanceFromStartMeters:42000},{name:'출발',latitude:37,longitude:128,distanceFromStartMeters:0}] };
describe('기존 코스로 모임 준비', () => {
  it('공개 코스의 거리·획고0·체크포인트 순서와 메모를 가져온다', () => {
    const course = parseSavedCourse('course-1', source)!;
    expect(course.distanceKm).toBe(100); expect(course.elevationGainM).toBe(0);
    expect(course.checkpoints.map(point=>point.name)).toEqual(['출발','카페']);
    expect(course.checkpoints[1]).toMatchObject({distanceKm:42,note:'물 보충',source:'course'});
    expect(course.track?.points[0]?.ele).toBe(0);
    expect(toCoursePlan(course)).toMatchObject({source:{kind:'saved-course',id:'course-1'},distanceKm:100,elevationGainM:0,checkpoints:course.checkpoints});
  });
  it('코스의 거리 기반 고도 프로필을 독립 샘플로 보존하고 지도 고도를 추정하지 않는다', () => {
    const course = parseSavedCourse('course-1',{...source, trackPoints:source.trackPoints.map(({lat,lon})=>({lat,lon})), elevationProfile:[{d:0,e:0},{d:50000,e:120},{d:100000,e:30}]})!;
    expect(course.track?.elevationProfile).toEqual([{distance:0,elevation:0},{distance:50000,elevation:120},{distance:100000,elevation:30}]);
    expect(course.track?.points[0]?.ele).toBeUndefined();
    const plan=toCoursePlan(course); plan.track!.elevationProfile![0]!.elevation=50;
    expect(course.track?.elevationProfile?.[0]?.elevation).toBe(0);
    expect(parseSavedCourse('course-1',{...source,elevationProfile:[{d:500,e:10},{d:0,e:0}]})?.track?.elevationProfile).toBeUndefined();
  });
  it('삭제·비공개·숨김 코스와 유효하지 않은 체크포인트는 노출하지 않는다', () => {
    expect(parseSavedCourse('course-1',{...source,visibility:'private'})).toBeNull();
    expect(parseSavedCourse('course-1',{...source,hidden:true})).toBeNull();
    expect(parseSavedCourse('course-1',{...source,deletedAt:1})).toBeNull();
    expect(parseSavedCourse('../invalid',source)).toBeNull();
    expect(parseSavedCourse('course-1',{...source,waypoints:[{name:'손상 좌표',latitude:999,longitude:128,distanceFromStartMeters:100}]} )?.checkpoints).toEqual([]);
  });
  it('누락된 획고를 고저차로 채우지 않고 복사한 계획은 원본과 독립한다', () => {
    const course = parseSavedCourse('course-1',{...source,elevationGain:undefined,elevationHigh:1000,elevationLow:100})!;
    expect(course.elevationGainM).toBeUndefined();
    const plan = toCoursePlan(course); plan.checkpoints[0]!.name='다른 집결';
    expect(course.checkpoints[0]!.name).toBe('출발');
  });
  it('목록은 트랙 원본 없이 필요한 필드만 공개·미삭제 조건으로 읽는다', async () => {
    const { trackPoints: _omit, ...listed } = source;
    mocks.runCourseListQuery.mockResolvedValueOnce({ docs: [{ id: 'course-1', data: listed }, { id: 'hidden', data: { ...listed, visibility: 'private' } }], rawCount: 20, cursor: { values: [] } });
    const page = await loadCourseCatalogPage();
    const query = mocks.runCourseListQuery.mock.calls[0]![1];
    expect(query.fields).toBe(COURSE_CATALOG_FIELDS);
    for (const heavy of ['trackPoints', 'elevationProfile', 'polyline']) expect(COURSE_CATALOG_FIELDS).not.toContain(heavy);
    expect(query.equals).toEqual([['visibility', { stringValue: 'public' }], ['deletedAt', { nullValue: null }]]);
    expect(page.items.map(item => item.id)).toEqual(['course-1']);
    expect(page.items[0]!.track).toBeUndefined();
    expect(page.items[0]!.checkpoints).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });
  it('가져오기는 고른 코스 하나의 원본으로 경로를 만들고, 없는 코스는 null 이다', async () => {
    mocks.loadCourseSource.mockResolvedValueOnce({ ...source, id: 'course-1' }).mockResolvedValueOnce(null);
    const course = await loadSavedCourse('course-1');
    expect(mocks.loadCourseSource.mock.calls[0]![1]).toBe('course-1');
    expect(course?.track?.points).toHaveLength(2);
    expect(await loadSavedCourse('gone')).toBeNull();
  });
});
