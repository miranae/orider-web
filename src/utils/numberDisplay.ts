/**
 * 화면에 보이는 숫자의 소수 자릿수 상한.
 * 나눗셈 결과를 그대로 넣으면 10.333333333333334 처럼 나오므로, 자릿수를 따로 정하지 않은 값은 이 함수로 감싼다.
 * 끝자리 0 은 빼고(10.50 → 10.5), 정수는 그대로 둔다. IF·W/kg 처럼 자릿수를 정해 둔 값에는 쓰지 않는다.
 */
export function capDecimals(value: number, maxDigits = 2): number {
  return Number.isFinite(value) ? Number(value.toFixed(maxDigits)) : value;
}
