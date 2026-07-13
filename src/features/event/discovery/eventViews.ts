export interface CalendarEvent {
  id: string;
  startTime: number;
}

export interface CalendarCell<T extends CalendarEvent> {
  date: Date;
  inMonth: boolean;
  events: T[];
}

export function buildMonthCells<T extends CalendarEvent>(events: T[], month: Date): CalendarCell<T>[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    return {
      date,
      inMonth: date.getMonth() === month.getMonth(),
      events: events.filter((event) => event.startTime >= date.getTime() && event.startTime < next.getTime()),
    };
  });
}

export function firstPolylinePoint(polyline: string | undefined, decode: (value: string) => [number, number][]): [number, number] | null {
  if (!polyline) return null;
  const point = decode(polyline)[0];
  return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? point : null;
}
