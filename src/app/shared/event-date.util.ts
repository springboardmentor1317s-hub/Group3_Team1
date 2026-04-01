export type EventDateCandidate = {
  status?: string | null;
  endDate?: string | null;
  dateTime?: string | null;
} & Record<string, unknown>;

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseEventLocalDay(value: unknown): Date | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoDateMatch) {
    const local = new Date(
      Number(isoDateMatch[1]),
      Number(isoDateMatch[2]) - 1,
      Number(isoDateMatch[3])
    );
    return Number.isNaN(local.getTime()) ? null : local;
  }

  const dayFirstMatch = /^(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(trimmed);
  if (dayFirstMatch) {
    const first = Number(dayFirstMatch[1]);
    const second = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);

    if (first > 12) {
      const local = new Date(year, second - 1, first);
      return Number.isNaN(local.getTime()) ? null : local;
    }

    if (second > 12) {
      const local = new Date(year, first - 1, second);
      return Number.isNaN(local.getTime()) ? null : local;
    }

    const local = new Date(year, second - 1, first);
    return Number.isNaN(local.getTime()) ? null : local;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function resolveEventDateCandidate(event: EventDateCandidate): string {
  const candidate = (
    event.endDate ||
    event.dateTime ||
    (typeof event['date'] === 'string' ? event['date'] : '') ||
    (typeof event['eventDate'] === 'string' ? event['eventDate'] : '') ||
    (typeof event['event_date'] === 'string' ? event['event_date'] : '') ||
    (typeof event['eventDateTime'] === 'string' ? event['eventDateTime'] : '') ||
    (typeof event['event_date_time'] === 'string' ? event['event_date_time'] : '') ||
    (typeof event['startDate'] === 'string' ? event['startDate'] : '') ||
    (typeof event['start_date'] === 'string' ? event['start_date'] : '') ||
    (typeof event['dateLabel'] === 'string' ? event['dateLabel'] : '') ||
    ''
  );
  return String(candidate || '').trim();
}

export function isEventClosedByDate(event: EventDateCandidate): boolean {
  const normalizedStatus = String(event.status || '').toLowerCase();
  if (normalizedStatus === 'past' || normalizedStatus === 'closed' || normalizedStatus === 'completed') {
    return true;
  }

  const candidate = resolveEventDateCandidate(event);
  const day = parseEventLocalDay(candidate);
  if (!day) return false;
  return day.getTime() < startOfToday().getTime();
}
