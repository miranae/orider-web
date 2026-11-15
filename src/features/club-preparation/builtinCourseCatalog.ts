import { readGpxCoursePlan, type CoursePlan } from './meetingCoursePlan';

/**
 * 앱에 내장된 실내 가상 코스 (orider-g1-web#3677).
 *
 * id·순서는 orider-g1-app `BuiltInVirtualCourses.all`, 이름·설명은 앱 ko 문자열(`indoor_builtin_*`)과 같다.
 * 앱이 모임 코스를 같은 id 의 자기 내장 코스로 알아보고, 서버(`club-meeting-builtin-courses.ts`)도 이 id 만 받는다.
 * GPX 는 `builtinCourses/` 에 앱 번들을 바이트 그대로 복사해 두었다(동기화 규칙은 그 폴더의 README).
 */
export type BuiltinCourse = { id: string; file: string; name: string; description: string };

export const BUILTIN_COURSES: readonly BuiltinCourse[] = [
  { id: 'builtin_hangang', file: 'hangang', name: '한강 자전거길', description: '잠실→반포 평지 왕복' },
  { id: 'builtin_namsan', file: 'namsan', name: '남산 순환로', description: '언덕 회전 코스' },
  { id: 'builtin_bukak', file: 'bukak', name: '북악 스카이웨이', description: '창의문→팔각정 업힐' },
  { id: 'builtin_haogogae', file: 'haogogae', name: '하오고개', description: '서판교→하오고개→청계 업힐 왕복' },
  { id: 'builtin_otgeori', file: 'otgeori', name: '옷걸이 코스', description: '반포↔잠실철교 한강 남·북단 순환' },
  { id: 'builtin_paldang', file: 'paldang', name: '팔당 라이딩', description: '뚝섬→구리→팔당역 한강 평지 왕복' },
  { id: 'builtin_bunwonri', file: 'bunwonri', name: '분원리', description: '팔당대교→팔당호변→분원리 왕복' },
  { id: 'builtin_saemangeum', file: 'saemangeum', name: '새만금 방조제', description: '군산 비응항→부안 새만금홍보관 평지 왕복' },
  { id: 'builtin_metdwaeji', file: 'metdwaeji', name: '멧돼지 코스', description: '탄천·남한산성·팔당호·하남 순환' },
  { id: 'builtin_dongbu5', file: 'dongbu5', name: '동부 5고개', description: '양수역 출발 벗·서후·명달리·다락재·유명산 순환' },
];

// 고른 코스의 GPX 만 따로 받는다 — 10개(약 470KB)를 작성 화면 청크에 싣지 않는다.
const gpxFiles = import.meta.glob<string>('./builtinCourses/*.gpx', { query: '?raw', import: 'default' });

/** GPX 업로드와 같은 파싱·간소화를 거치고 출처만 내장 코스로 바꾼다. */
export async function loadBuiltinCoursePlan(course: BuiltinCourse): Promise<CoursePlan> {
  const load = gpxFiles[`./builtinCourses/${course.file}.gpx`];
  if (!load) throw new Error(`builtin_course_missing:${course.id}`);
  const plan = readGpxCoursePlan(await load(), `${course.file}.gpx`);
  // 번들 GPX 의 <name> 은 영문 파일명이다 — 생성 구간 이름은 코스 한글 이름으로 보인다.
  const segments = plan.segments.map(segment => ({ ...segment, name: segment.name.replace(`${course.file} · `, `${course.name} · `) }));
  return { ...plan, segments, source: { kind: 'builtin', id: course.id, name: course.name } };
}
