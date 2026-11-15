import { describe, expect, it } from 'vitest';
import { BUILTIN_COURSES, loadBuiltinCoursePlan } from './builtinCourseCatalog';

// 서버 허용 목록(orider-g1-web functions/src/event/club-meeting-builtin-courses.ts)·앱 BuiltInVirtualCourses.all 과 같은 순서.
const APP_IDS = ['builtin_hangang', 'builtin_namsan', 'builtin_bukak', 'builtin_haogogae', 'builtin_otgeori', 'builtin_paldang', 'builtin_bunwonri', 'builtin_saemangeum', 'builtin_metdwaeji', 'builtin_dongbu5'];

describe('앱 내장 실내 코스 (orider-g1-web#3677)', () => {
  it('앱·서버와 같은 id 10종을 같은 순서로 보인다', () => {
    expect(BUILTIN_COURSES.map(course => course.id)).toEqual(APP_IDS);
  });
  it.each(BUILTIN_COURSES.map(course => [course.id, course] as const))('%s 는 모임 출발이 받는 경로와 내장 코스 출처를 만든다', async (_id, course) => {
    const plan = await loadBuiltinCoursePlan(course);
    expect(plan.source).toEqual({ kind: 'builtin', id: course.id, name: course.name });
    // 서버 meetingVirtualCourse: 2~2,000점, 끊어지지 않은 단일 구간.
    expect(plan.track!.points.length).toBeGreaterThanOrEqual(2);
    expect(plan.track!.points.length).toBeLessThanOrEqual(2000);
    expect(plan.track!.segmentStarts?.length ?? 0).toBeLessThanOrEqual(1);
    expect(plan.distanceKm).toBeGreaterThan(0);
    expect(plan.segments.every(segment => segment.name.startsWith(`${course.name} · `))).toBe(true);
  });
});
