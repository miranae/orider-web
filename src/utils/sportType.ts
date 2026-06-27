type SportConfig = { icon: string; labelKey: string; color: string };

const SPORT_MAP: Record<string, SportConfig> = {
  ride:             { icon: "🚴",  labelKey: "sport.ride",         color: "orange" },
  mountainbikeride: { icon: "🚵",  labelKey: "sport.mtb",          color: "amber" },
  gravelride:       { icon: "🚴",  labelKey: "sport.gravel",       color: "yellow" },
  ebikeride:        { icon: "🚴‍♂️", labelKey: "sport.ebike",        color: "lime" },
  velolift:         { icon: "🚴",  labelKey: "sport.velolift",     color: "orange" },
  virtualride:      { icon: "🖥️",  labelKey: "sport.virtualRide",  color: "blue" },
  run:              { icon: "🏃",  labelKey: "sport.run",          color: "green" },
  trailrun:         { icon: "🏃",  labelKey: "sport.trailRun",     color: "emerald" },
  virtualrun:       { icon: "🖥️",  labelKey: "sport.virtualRun",   color: "teal" },
  walk:             { icon: "🚶",  labelKey: "sport.walk",         color: "teal" },
  hike:             { icon: "🥾",  labelKey: "sport.hike",         color: "emerald" },
  swim:             { icon: "🏊",  labelKey: "sport.swim",         color: "cyan" },
  workout:          { icon: "💪",  labelKey: "sport.workout",      color: "purple" },
  weighttraining:   { icon: "🏋️",  labelKey: "sport.weightTraining", color: "violet" },
  yoga:             { icon: "🧘",  labelKey: "sport.yoga",         color: "pink" },
  tennis:           { icon: "🎾",  labelKey: "sport.tennis",       color: "lime" },
  soccer:           { icon: "⚽",  labelKey: "sport.soccer",       color: "green" },
  golf:             { icon: "⛳",  labelKey: "sport.golf",         color: "green" },
  ski:              { icon: "⛷️",  labelKey: "sport.ski",          color: "sky" },
  snowboard:        { icon: "🏂",  labelKey: "sport.snowboard",    color: "sky" },
};

const DEFAULT: SportConfig = { icon: "🏅", labelKey: "sport.activity", color: "gray" };

export function getSportConfig(type?: string | null): SportConfig {
  if (!type) return DEFAULT;
  return SPORT_MAP[type.toLowerCase()] ?? DEFAULT;
}

export function getSportIcon(type?: string | null): string {
  return getSportConfig(type).icon;
}

export function getSportLabelKey(type?: string | null): string {
  return getSportConfig(type).labelKey;
}
