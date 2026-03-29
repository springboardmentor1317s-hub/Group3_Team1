export interface AdminOwnershipSource {
  userId?: string | null;
  id?: string | null;
  email?: string | null;
  name?: string | null;
  college?: string | null;
}

export interface AdminOwnedEventCandidate {
  createdBy?: string | null;
  createdById?: string | null;
  ownerId?: string | null;
  adminId?: string | null;
  userId?: string | null;
  email?: string | null;
  organizer?: string | null;
  collegeName?: string | null;
}

function normalizeValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildAdminProfileIdentifiers(source?: AdminOwnershipSource | null): string[] {
  return [
    source?.userId,
    source?.id,
    source?.email,
    source?.name,
    source?.college
  ]
    .filter(Boolean)
    .map((value) => normalizeValue(value));
}

export function getAdminEventOwnershipCandidates(event?: AdminOwnedEventCandidate | null): {
  strict: string[];
  fallback: string[];
  combined: string[];
} {
  const strict = [
    event?.createdById,
    event?.ownerId,
    event?.adminId,
    event?.userId,
    event?.createdBy,
    event?.email
  ]
    .filter(Boolean)
    .map((value) => normalizeValue(value));

  const fallback = [
    event?.organizer,
    event?.collegeName
  ]
    .filter(Boolean)
    .map((value) => normalizeValue(value));

  return {
    strict,
    fallback,
    combined: [...strict, ...fallback]
  };
}

export function isEventOwnedByAdmin(event: AdminOwnedEventCandidate, identifiers: string[]): boolean {
  if (!identifiers.length) return true;

  const candidates = getAdminEventOwnershipCandidates(event);
  if (candidates.strict.some((value) => identifiers.includes(value))) {
    return true;
  }

  return candidates.fallback.some((value) => identifiers.includes(value));
}

export function filterEventsOwnedByAdmin<T extends AdminOwnedEventCandidate>(events: T[], identifiers: string[]): T[] {
  if (!identifiers.length) return events;
  return (events || []).filter((event) => isEventOwnedByAdmin(event, identifiers));
}
