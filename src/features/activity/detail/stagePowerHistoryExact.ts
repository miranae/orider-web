const MAX_DURATION_MILLISECONDS = 604_800_000;
/** 표시는 Float64지만 순서는 정수 ms 에너지 영수증의 유리수로 비교한다. */
function receipt(energy: string, durationMilliseconds: number) {
  if (typeof energy !== "string" || !/^(0|[1-9][0-9]{0,31})$/u.test(energy) || !Number.isSafeInteger(durationMilliseconds)
    || durationMilliseconds < 1 || durationMilliseconds > MAX_DURATION_MILLISECONDS) throw new Error("invalid_power_energy_receipt");
  const numerator = BigInt(energy), denominator = BigInt(durationMilliseconds);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) * denominator) throw new Error("invalid_power_energy_receipt");
  return { numerator, denominator };
}
export function compareExactPowerEnergy(leftEnergy: string, leftDurationMilliseconds: number, rightEnergy: string, rightDurationMilliseconds: number): -1 | 0 | 1 {
  const left = receipt(leftEnergy, leftDurationMilliseconds), right = receipt(rightEnergy, rightDurationMilliseconds);
  const a = left.numerator * right.denominator, b = right.numerator * left.denominator;
  return a > b ? 1 : a < b ? -1 : 0;
}
/** 먼저 정확한 차를 구한 후 화면에 표시할 때만 Float64로 바꾼다. */
export function exactPowerEnergyDifference(leftEnergy: string, leftDurationMilliseconds: number, rightEnergy: string, rightDurationMilliseconds: number): number {
  const left = receipt(leftEnergy, leftDurationMilliseconds), right = receipt(rightEnergy, rightDurationMilliseconds);
  return Number(left.numerator * right.denominator - right.numerator * left.denominator) / Number(left.denominator * right.denominator);
}
function ratio(numerator: string, denominator: string) {
  if (typeof numerator !== "string" || typeof denominator !== "string" || !/^(0|[1-9][0-9]{0,127})$/u.test(numerator) || !/^[1-9][0-9]{0,127}$/u.test(denominator)) throw new Error("invalid_power_weight_receipt");
  return { n: BigInt(numerator), d: BigInt(denominator) };
}
export function compareExactPowerRatios(left: { numerator: string; denominator: string }, right: { numerator: string; denominator: string }): -1 | 0 | 1 {
  const a = ratio(left.numerator, left.denominator), b = ratio(right.numerator, right.denominator), difference = a.n * b.d - b.n * a.d;
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}
export function exactPowerRatioDifference(left: { numerator: string; denominator: string }, right: { numerator: string; denominator: string }) {
  const a = ratio(left.numerator, left.denominator), b = ratio(right.numerator, right.denominator);
  return Number(a.n * b.d - b.n * a.d) / Number(a.d * b.d);
}
/** 계산 당시 저장된 binary64 체중의 exact 비율. 현재 프로필을 읽지 않는다. */
export function exactPowerWeightRatio(energy: string, durationMilliseconds: number, weightKg: number) {
  const value = receipt(energy, durationMilliseconds);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) throw new Error("invalid_power_weight_receipt");
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, weightKg);
  const bits = view.getBigUint64(0), exponent = Number((bits >> 52n) & 2047n) - 1023 - 52;
  let n = (bits & ((1n << 52n) - 1n)) | (1n << 52n), d = 1n;
  if (exponent < 0) d <<= BigInt(-exponent); else n <<= BigInt(exponent);
  let numerator = value.numerator * d, denominator = value.denominator * n;
  let a = numerator, b = denominator; while (b) { const next = a % b; a = b; b = next; }
  numerator /= a; denominator /= a;
  return { numerator: numerator.toString(), denominator: denominator.toString() };
}
/** 정수 에너지/시간을 커널과 동일하게 nearest-even binary64로 한 번만 반올림한다. */
export function roundedExactPowerAverage(energy: string, durationMilliseconds: number): number {
  const { numerator: value, denominator } = receipt(energy, durationMilliseconds);
  if (value === 0n) return 0;
  let exponent = value.toString(2).length - denominator.toString(2).length;
  if (exponent >= 0 ? value < denominator << BigInt(exponent) : value << BigInt(-exponent) < denominator) exponent--;
  const outputExponent = Math.max(-1074, exponent - 52), shift = -outputExponent;
  const numerator = shift >= 0 ? value << BigInt(shift) : value;
  const divisor = shift >= 0 ? denominator : denominator << BigInt(-shift);
  let coefficient = numerator / divisor;
  const remainder = numerator % divisor;
  if (remainder * 2n > divisor || remainder * 2n === divisor && (coefficient & 1n) !== 0n) coefficient++;
  return Number(coefficient) * 2 ** outputExponent;
}
