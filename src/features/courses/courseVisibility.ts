export function isVisibleCourseDocData(data: Record<string, unknown>): boolean {
  return data.deletedAt == null && data.hidden !== true;
}
