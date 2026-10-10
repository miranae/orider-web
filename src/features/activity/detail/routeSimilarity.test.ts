import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { encodePolyline } from "../../../utils/polyline";
import { similarRouteCandidates, validatedThumbnail } from "./routeSimilarity";
const points: [number, number][] = [[37, 127], [37.003, 127], [37.006, 127], [37.009, 127]];
const activity = (id: string, route = points): Activity => ({ id, userId: "owner", startTime: id === "current" ? 100 : 50, type: "Ride", thumbnailTrack: encodePolyline(route), summary: { distance: 1000 } }) as Activity;
describe("thumbnail route candidates", () => {
  it("resamples by arc length rather than recording density", () => {
    const dense: [number, number][] = [[37, 127], [37.001, 127], [37.002, 127], [37.003, 127], [37.009, 127]];
    expect(similarRouteCandidates(activity("current"), [activity("dense", dense)]).candidates.map((a) => a.id)).toEqual(["dense"]);
  });
  it("rejects reverse direction, short overlap and incomplete thumbnail coverage", () => {
    const current = activity("current");
    expect(similarRouteCandidates(current, [activity("reverse", [...points].reverse()), activity("short", points.map(([lat, lng]) => [37 + (lat - 37) / 3, lng]))]).candidates).toEqual([]);
    expect(similarRouteCandidates({ ...current, summary: { distance: 5000 } } as Activity, []).available).toBe(false);
  });
  it("rejects opposite closed loops despite identical endpoints", () => {
    const loop: [number, number][] = [[37, 127], [37.003, 127], [37.003, 127.003], [37, 127.003], [37, 127]];
    const current = { ...activity("current", loop), summary: { distance: 1200 } } as Activity;
    expect(similarRouteCandidates(current, [{ ...activity("reverse", [...loop].reverse()), summary: { distance: 1200 } } as Activity]).candidates).toEqual([]);
  });
  it("only considers owner, earlier, same sport, nondeleted outdoor activities", () => {
    const previous = activity("previous");
    const ineligible = [{ ...previous, userId: "other" }, { ...previous, deletedAt: 1 }, { ...previous, type: "Run" }, { ...previous, startTime: 200 }, { ...previous, trainer: true }, { ...previous, type: "VirtualRide" }];
    expect(similarRouteCandidates(activity("current"), ineligible).candidates).toEqual([]);
    expect(similarRouteCandidates({ ...activity("current"), trainer: true }, [previous]).available).toBe(false);
  });
  it("rejects a shifted start and routes with a different interior despite close endpoints", () => {
    const shifted = points.map(([lat, lng]): [number, number] => [lat + 0.004, lng]);
    const detour: [number, number][] = [[37, 127], [37.003, 127.006], [37.006, 127.006], [37.009, 127]];
    expect(similarRouteCandidates(activity("current"), [activity("shifted", shifted), { ...activity("detour", detour), summary: { distance: 1800 } } as Activity]).candidates).toEqual([]);
  });
  it("checks at most 50 loaded candidates", () => {
    const result = similarRouteCandidates(activity("current"), Array.from({ length: 51 }, (_, index) => activity(String(index))));
    expect(result.checked).toBe(50); expect(result.candidates).toHaveLength(50);
  });
  it.each(["37x,127;37,127;37,127;37,127", "91,127;37,127;37,127;37,127", "~~~~~~~?", "~~~~~??", "???", "_p~iF~ps|U_ulLnnqC_mqNvxq", "a".repeat(30001), "37,127;".repeat(4097), "37,127;37,127;37,127;37,127;"])("rejects malformed, truncated or oversized input", (track) => {
    expect(validatedThumbnail(track)).toBeNull();
  });
  it("accepts both validated formats and rejects stationary thumbnails", () => {
    expect(validatedThumbnail(points.map((p) => p.join(",")).join(";"))).toEqual(points);
    expect(validatedThumbnail(encodePolyline(points))).toEqual(points);
    expect(similarRouteCandidates(activity("current", Array(4).fill([37, 127])), []).available).toBe(false);
  });
});
