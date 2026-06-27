import type { Activity, ActivityStreams } from "@shared/types";
import { makeRelSecAt } from "./streamTime";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateGpx(activity: Activity, streams: ActivityStreams): string {
  const latlng = streams.latlng;
  if (!latlng || latlng.length === 0) return "";

  const startTime = activity.startTime;
  const timeArr = streams.time;
  // streams.time 단위 정규화(상대 초) — 절대 epoch 입력 시 <time> 이 서기 5만년대로
  // 오버플로우하던 버그 방지(TCX 와 동일 수정).
  const relSecAt = makeRelSecAt(timeArr);
  const altArr = streams.altitude;
  const hrArr = streams.heartrate;
  const wattsArr = streams.watts;
  const cadArr = streams.cadence;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx creator="O-Rider" version="1.1" ' +
    'xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );
  lines.push("  <trk>");
  lines.push(`    <name>${escapeXml(activity.description || "Ride")}</name>`);
  lines.push("    <trkseg>");

  for (let i = 0; i < latlng.length; i++) {
    const pt = latlng[i];
    if (!pt) continue;
    const [lat, lon] = pt;

    let trkpt = `      <trkpt lat="${lat}" lon="${lon}">`;

    if (altArr?.[i] != null) {
      trkpt += `<ele>${altArr[i]}</ele>`;
    }

    const relSec = relSecAt(i);
    if (relSec != null) {
      const ts = new Date(startTime + relSec * 1000).toISOString();
      trkpt += `<time>${ts}</time>`;
    }

    const hasExt = (hrArr?.[i] != null) || (wattsArr?.[i] != null) || (cadArr?.[i] != null);
    if (hasExt) {
      trkpt += "<extensions><gpxtpx:TrackPointExtension>";
      if (hrArr?.[i] != null) trkpt += `<gpxtpx:hr>${hrArr[i]}</gpxtpx:hr>`;
      if (cadArr?.[i] != null) trkpt += `<gpxtpx:cad>${cadArr[i]}</gpxtpx:cad>`;
      if (wattsArr?.[i] != null) trkpt += `<gpxtpx:power>${wattsArr[i]}</gpxtpx:power>`;
      trkpt += "</gpxtpx:TrackPointExtension></extensions>";
    }

    trkpt += "</trkpt>";
    lines.push(trkpt);
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");

  return lines.join("\n");
}
