export function isYearRecapSeason(date = new Date()): boolean {
  return date.getMonth() === 11;
}
