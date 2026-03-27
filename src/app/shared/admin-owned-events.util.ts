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

export function buildAdminProfileIdentifiers(source?: AdminOwnershipSource | null): string[] {
  return [
    source?.userId,
    source?.id,
    source?.email,
    source?.name,
    source?.college
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

export function filterEventsOwnedByAdmin<T extends AdminOwnedEventCandidate>(events: T[], identifiers: string[]): T[] {
  if (!identifiers.length) return events;

  return (events || []).filter((event) => {
    const primaryCandidates = [
      event?.createdBy,
      event?.createdById,
      event?.ownerId,
      event?.adminId,
      event?.userId,
      event?.email
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    if (primaryCandidates.some((value) => identifiers.includes(value))) {
      return true;
    }

    const fallbackCandidates = [
      event?.organizer,
      event?.collegeName
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return fallbackCandidates.some((value) => identifiers.includes(value));
  });
}
