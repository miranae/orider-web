/**
 * className 결합 헬퍼. clsx 의존성 회피용 미니 구현.
 *
 * - falsy 값(false, 0, '', null, undefined) 무시
 * - 배열은 평탄화
 * - 객체는 { key: truthy } 일 때만 key 추가
 */
export type ClassValue = string | number | boolean | null | undefined | Record<string, unknown> | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v));
    } else if (Array.isArray(v)) {
      const inner = cn(...v);
      if (inner) out.push(inner);
    } else if (typeof v === 'object') {
      for (const [k, on] of Object.entries(v)) if (on) out.push(k);
    }
  }
  return out.join(' ');
}
