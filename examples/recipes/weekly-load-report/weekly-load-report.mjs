#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const apiKey = process.env.ORIDER_API_KEY;
const apiBase = (process.env.ORIDER_API_BASE || "https://orider.co.kr/api/v1").replace(/\/$/, "");
const includePrivateMaps = process.env.ORIDER_INCLUDE_PRIVATE_MAPS === "true";

if (!apiKey) {
  console.error("Missing ORIDER_API_KEY.");
  process.exit(1);
}

const now = new Date();
const MS_DAY = 24 * 60 * 60 * 1000;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function apiGet(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "X-API-Key": apiKey },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error?.message || payload?.message || `HTTP ${res.status} ${path}`);
  }
  return payload.data;
}

function readActivityTimeMs(activity) {
  const start = typeof activity.startTime === "number" ? activity.startTime : Date.parse(activity.startTime);
  return Number.isFinite(start) ? start : 0;
}

function activityDistanceKm(activity) {
  return Number(activity.distanceMeters || 0) / 1000;
}

function activityMovingMin(activity) {
  return Math.round(Number(activity.movingTimeSeconds || 0) / 60);
}

function activityElevationM(activity) {
  return Number(activity.elevationGainMeters || 0);
}

function activityLoad(activity) {
  return Number(activity.tss || 0);
}

function totals(activities) {
  return activities.reduce((acc, activity) => {
    acc.sessions += 1;
    acc.distanceKm += activityDistanceKm(activity);
    acc.movingMin += activityMovingMin(activity);
    acc.elevationM += activityElevationM(activity);
    acc.load += activityLoad(activity);
    acc.activeDates.add(isoDate(new Date(readActivityTimeMs(activity))));
    return acc;
  }, {
    sessions: 0,
    distanceKm: 0,
    movingMin: 0,
    elevationM: 0,
    load: 0,
    activeDates: new Set(),
  });
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function delta(current, previous, suffix = "") {
  if (previous <= 0 && current <= 0) return "no change";
  if (previous <= 0) return `new ${Math.round(current)}${suffix}`;
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  const sign = diff > 0 ? "+" : "";
  return `${sign}${Math.round(diff)}${suffix} (${sign}${pct}%)`;
}

function classifyLoad(weekLoad, previousLoad) {
  const deltaPct = previousLoad > 0 ? ((weekLoad - previousLoad) / previousLoad) * 100 : 0;
  if (weekLoad >= 450 || deltaPct >= 35) {
    return {
      state: "high load",
      lead: "This week is carrying a higher fatigue load.",
      action: "Use the next 24-48 hours for recovery or Z1/Z2 before another hard session.",
    };
  }
  if (weekLoad >= 220 || deltaPct >= 10) {
    return {
      state: "building",
      lead: "This week is building training load.",
      action: "Keep recovery between hard sessions and finish the week with sustainable Z2.",
    };
  }
  return {
    state: "light week",
    lead: "This week is a lighter training week.",
    action: "If you feel fresh, add one focused stimulus such as short tempo or hill repeats.",
  };
}

function dailyLoadBars(activities) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() - (6 - index) * MS_DAY);
    return { key: isoDate(date), label: date.toLocaleDateString("en", { weekday: "short" }), value: 0 };
  });
  const byDate = new Map(days.map((day) => [day.key, day]));
  for (const activity of activities) {
    const key = isoDate(new Date(readActivityTimeMs(activity)));
    const day = byDate.get(key);
    if (day) day.value += activityLoad(activity);
  }
  return days;
}

function renderBarChart(bars) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const width = 640;
  const height = 180;
  const baseY = 132;
  const gap = 18;
  const barW = (width - gap * (bars.length + 1)) / bars.length;
  const rects = bars.map((bar, index) => {
    const h = Math.max(4, Math.round((bar.value / max) * 96));
    const x = gap + index * (barW + gap);
    const y = baseY - h;
    const fill = bar.value >= 80 ? "#dc2626" : bar.value >= 45 ? "#d97706" : bar.value > 0 ? "#65a30d" : "#e5e7eb";
    return `
      <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#6b7280">${Math.round(bar.value) || "-"}</text>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="7" fill="${fill}" />
      <text x="${x + barW / 2}" y="158" text-anchor="middle" font-size="12" font-weight="650" fill="#374151">${bar.label}</text>
    `;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Daily load chart">${rects}</svg>`;
}

function normalizePoint(lat, lon, bounds, width, height) {
  const x = ((lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.000001)) * width;
  const y = height - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.000001)) * height;
  return [Number.isFinite(x) ? x : width / 2, Number.isFinite(y) ? y : height / 2];
}

function renderPrivateRouteSvg(latlng) {
  if (!Array.isArray(latlng) || latlng.length < 2) return "";
  const points = latlng
    .filter((pair) => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    .slice(0, 500);
  if (points.length < 2) return "";
  const bounds = points.reduce((acc, [lat, lon]) => ({
    minLat: Math.min(acc.minLat, lat),
    maxLat: Math.max(acc.maxLat, lat),
    minLon: Math.min(acc.minLon, lon),
    maxLon: Math.max(acc.maxLon, lon),
  }), { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity });
  const width = 420;
  const height = 180;
  const d = points.map(([lat, lon], index) => {
    const [x, y] = normalizePoint(lat, lon, bounds, width, height);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Private route thumbnail">
      <rect width="${width}" height="${height}" rx="16" fill="#f3f4f6" />
      <path d="${d}" fill="none" stroke="#65a30d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

async function loadPrivateThumbnails(activities) {
  if (!includePrivateMaps) return [];
  const keySessions = [...activities]
    .sort((a, b) => (activityLoad(b) - activityLoad(a)) || (activityDistanceKm(b) - activityDistanceKm(a)))
    .slice(0, 2);
  const result = [];
  for (const activity of keySessions) {
    try {
      const streams = await apiGet(`/activities/${encodeURIComponent(activity.id)}/streams`);
      const svg = renderPrivateRouteSvg(streams?.latlng);
      if (svg) result.push({ activity, svg });
    } catch (err) {
      console.warn(`Skipping private thumbnail for ${activity.id}: ${err.message}`);
    }
  }
  return result;
}

function renderHtml(summary, bars, thumbnails) {
  const chart = renderBarChart(bars);
  const thumbnailHtml = thumbnails.length > 0
    ? `
      <section class="panel">
        <h2>Private route thumbnails</h2>
        <p class="muted">These are for your private report only. Remove them before public sharing.</p>
        <div class="thumbs">
          ${thumbnails.map(({ activity, svg }) => `
            <article class="thumb">
              ${svg}
              <strong>${escapeHtml(isoDate(new Date(readActivityTimeMs(activity))))}</strong>
              <span>${Math.round(activityDistanceKm(activity))} km · ${formatDuration(activityMovingMin(activity))} · load ${Math.round(activityLoad(activity))}</span>
            </article>
          `).join("")}
        </div>
      </section>
    `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Weekly Load Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f3f4f6; color: #111827; }
    main { max-width: 880px; margin: 0 auto; padding: 28px 18px 48px; }
    header { background: #111827; color: white; border-radius: 18px; padding: 28px; }
    h1 { margin: 8px 0; font-size: 30px; line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .label { color: #bef264; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .lead { color: #d1d5db; line-height: 1.6; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .kpi, .panel { background: white; border: 1px solid #d1d5db; border-radius: 16px; padding: 18px; }
    .kpi span { display: block; color: #6b7280; font-size: 12px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }
    .kpi strong { display: block; margin-top: 8px; font-size: 28px; }
    .kpi small, .muted { color: #6b7280; line-height: 1.5; }
    .grid { display: grid; gap: 16px; }
    .thumbs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .thumb { display: grid; gap: 8px; }
    .thumb span { color: #6b7280; font-size: 13px; }
    @media (max-width: 680px) { .kpis, .thumbs { grid-template-columns: 1fr; } header { padding: 22px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="label">Orider Personal Data Recipe</div>
      <h1>Weekly Load Report</h1>
      <p class="lead">${escapeHtml(summary.lead)}</p>
    </header>

    <section class="kpis">
      <div class="kpi"><span>Load</span><strong>${Math.round(summary.week.load)}</strong><small>${escapeHtml(summary.loadDelta)} vs previous 7 days</small></div>
      <div class="kpi"><span>Distance</span><strong>${Math.round(summary.week.distanceKm)} km</strong><small>${escapeHtml(summary.distanceDelta)} vs previous</small></div>
      <div class="kpi"><span>Moving time</span><strong>${escapeHtml(formatDuration(summary.week.movingMin))}</strong><small>${summary.week.sessions} sessions · ${summary.week.activeDays} active days</small></div>
    </section>

    <section class="panel">
      <h2>Daily load</h2>
      ${chart}
      <p class="muted">80+ marks a hard-day candidate, 45-79 is moderate load, and 1-44 is light work.</p>
    </section>

    ${thumbnailHtml}

    <section class="panel">
      <h2>Readout</h2>
      <ul>
        <li>State: ${escapeHtml(summary.state)}</li>
        <li>Elevation: ${Math.round(summary.week.elevationM)} m</li>
        <li>Next action: ${escapeHtml(summary.action)}</li>
      </ul>
    </section>
  </main>
</body>
</html>`;
}

const activities = await apiGet("/activities?limit=100");
const fitness = await apiGet("/fitness/summary").catch((err) => {
  console.warn(`Fitness summary unavailable: ${err.message}`);
  return null;
});

const withStart = Array.isArray(activities)
  ? activities.filter((activity) => readActivityTimeMs(activity) > 0)
  : [];
const recent7 = withStart.filter((activity) => readActivityTimeMs(activity) >= now.getTime() - 7 * MS_DAY);
const previous7 = withStart.filter((activity) => {
  const t = readActivityTimeMs(activity);
  return t >= now.getTime() - 14 * MS_DAY && t < now.getTime() - 7 * MS_DAY;
});

const weekRaw = totals(recent7);
const previousRaw = totals(previous7);
const week = { ...weekRaw, activeDays: weekRaw.activeDates.size };
const previous = { ...previousRaw, activeDays: previousRaw.activeDates.size };
delete week.activeDates;
delete previous.activeDates;

const load = classifyLoad(week.load, previous.load);
const summary = {
  generatedAt: now.toISOString(),
  state: load.state,
  lead: load.lead,
  action: load.action,
  week,
  previous,
  fitness,
  loadDelta: delta(week.load, previous.load),
  distanceDelta: delta(week.distanceKm, previous.distanceKm, " km"),
};

const bars = dailyLoadBars(recent7);
const thumbnails = await loadPrivateThumbnails(recent7);
const publicSummary = `${week.sessions} sessions · ${Math.round(week.distanceKm)} km · ${formatDuration(week.movingMin)} · load ${Math.round(week.load)}. ${load.action}`;

await writeFile("weekly-load-summary.json", `${JSON.stringify(summary, null, 2)}\n`);
await writeFile("weekly-load-public-summary.txt", `${publicSummary}\n`);
await writeFile("weekly-load-report.html", renderHtml(summary, bars, thumbnails));

console.log("Wrote weekly-load-report.html");
console.log("Wrote weekly-load-summary.json");
console.log("Wrote weekly-load-public-summary.txt");
