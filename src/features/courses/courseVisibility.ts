export function isVisibleCourseDocData(data: Record<string, unknown>): boolean {
  return data.deletedAt == null;
}
