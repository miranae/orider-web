import { expect, it } from "vitest";
import { compareExactPowerEnergy, exactPowerEnergyDifference } from "./stagePowerHistoryExact";
it("orders equal rounded power by the exact transported integer energy rather than Float64 watts", () => {
  const left = "9007199254740991000", right = "9007199254740990999";
  expect(Number(left) / 1000).toBe(Number(right) / 1000);
  expect(compareExactPowerEnergy(left, 1000, right, 1000)).toBe(1);
  expect(compareExactPowerEnergy(right, 1000, left, 1000)).toBe(-1);
  expect(exactPowerEnergyDifference(left, 1000, right, 1000)).toBe(0.001);
});
it("handles true zero, equivalent ratios, fractional averages and different duration denominators", () => {
  expect(compareExactPowerEnergy("0", 1000, "0", 137000)).toBe(0);
  expect(compareExactPowerEnergy("500000", 2000, "250000", 1000)).toBe(0);
  expect(compareExactPowerEnergy("1", 17000, "1", 137000)).toBe(1);
  expect(exactPowerEnergyDifference("500001", 2000, "250000", 1000)).toBe(0.0005);
  expect(exactPowerEnergyDifference("0", 1000, "1000", 1000)).toBe(-1);
});
it.each(["", "00", "01", "-1", "+1", "1.5", "1e20", "1".repeat(33)])("rejects a noncanonical or unbounded receipt %s", energy => {
  expect(() => compareExactPowerEnergy(energy, 1000, "0", 1000)).toThrow();
});
it.each([0, -1, 1.5, NaN, Infinity, 604800001])("rejects invalid duration %s", milliseconds => {
  expect(() => compareExactPowerEnergy("0", milliseconds, "0", 1000)).toThrow();
});
it("bounds receipt energy by the native safe integer power envelope", () => {
  expect(() => compareExactPowerEnergy(1 as unknown as string, 1000, "0", 1000)).toThrow();
  const energy = (BigInt(Number.MAX_SAFE_INTEGER) * 604800000n).toString();
  expect(compareExactPowerEnergy(energy, 604800000, energy, 604800000)).toBe(0);
  expect(() => compareExactPowerEnergy((BigInt(energy) + 1n).toString(), 604800000, "0", 1000)).toThrow();
});
it("rounds native E/D once to nearest-even rather than converting large integer energy first", async () => {
  const { roundedExactPowerAverage } = await import("./stagePowerHistoryExact");
  expect(roundedExactPowerAverage("0",1000)).toBe(0);
  expect(roundedExactPowerAverage("1",1000)).toBe(0.001);
  expect(roundedExactPowerAverage("9007199254740993",2)).toBe(4503599627370496);
  expect(roundedExactPowerAverage("9007199254740995",2)).toBe(4503599627370498);
  expect(roundedExactPowerAverage((BigInt(Number.MAX_SAFE_INTEGER)*604800000n).toString(),604800000)).toBe(Number.MAX_SAFE_INTEGER);
});
