import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { BackendEvent, EventService } from './event.service';

export interface StudentProfile {
  id: string;
  name: string;
  userId: string;
  email: string;
  role: string;
  college: string;
  phone?: string;
  location?: string;
  department?: string;
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentRegistrationRecord {
  id: string;
  eventId: string;
  eventName: string;
  studentId: string;
  studentName: string;
  email: string;
  college: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  event: {
    id: string;
    name: string;
    dateTime: string;
    location: string;
    organizer: string;
    contact: string;
    description: string;
    category: string;
    posterDataUrl: string | null;
    status: string;
    registrations: number;
    maxAttendees: number;
    dateLabel: string;
  } | null;
}

export interface StudentEventCard {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  dateTime: string;
  registrationDeadline?: string | null;
  registrationDeadlineLabel?: string;
  dateLabel: string;
  timeLabel: string;
  imageUrl: string | null;
  organizer: string;
  contact: string;
  status: 'Open' | 'Registered' | 'Full' | 'Closed';
  registrations: number;
  maxAttendees: number;
  collegeName: string;
  registered?: boolean;
  endDate?: string | null;
}

export interface StudentNotificationItem {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
  createdAt: string;
  icon: string;
  category: 'overview' | 'registration' | 'approval' | 'event';
}

export interface StudentEventReview {
  id?: string;
  reviewId?: string;
  userId?: string;
  studentId?: string;
  eventId: string;
  rating: number;
  feedback: string;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  reviewerName?: string;
  userName?: string;
  profilePhotoUrl?: string;
  avatarUrl?: string;
  profileImage?: string;
  photoUrl?: string;
}

export interface StudentEventComment {
  id: string;
  eventId: string;
  parentCommentId: string | null;
  authorId: string;
  name: string;
  avatarUrl: string;
  text: string;
  likes: string[];
  createdAt: string;
  updatedAt: string;
  replies?: StudentEventComment[];
}

export interface StudentDashboardSnapshot {
  profile: StudentProfile;
  events: StudentEventCard[];
  registrations: StudentRegistrationRecord[];
  stats: {
    upcomingEvents: number;
    myRegistrations: number;
    approvedEntries: number;
  };
  notifications: StudentNotificationItem[];
}

type StudentNotificationTone = StudentNotificationItem['tone'];
type StudentNotificationCategory = StudentNotificationItem['category'];

@Injectable({
  providedIn: 'root'
})
export class StudentDashboardService {
  private readonly apiUrl = '/api';
  private readonly snapshotStorageKey = 'studentDashboardSnapshot';
  private readonly currentUserStorageKey = 'currentUser';
  private snapshotRequest$?: Observable<StudentDashboardSnapshot>;
  private profileRequest$?: Observable<StudentProfile>;
  private eventsRequest$?: Observable<StudentEventCard[]>;
  private registrationsRequest$?: Observable<StudentRegistrationRecord[]>;
  private cachedProfile: StudentProfile | null = null;
  private cachedEvents: StudentEventCard[] = [];
  private cachedRegistrations: StudentRegistrationRecord[] = [];
  private cachedStats: StudentDashboardSnapshot['stats'] = {
    upcomingEvents: 0,
    myRegistrations: 0,
    approvedEntries: 0
  };
  private cachedNotifications: StudentNotificationItem[] = [];
  private cachedSnapshot: StudentDashboardSnapshot | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private eventService: EventService
  ) {
    this.restoreSnapshotFromStorage();
  }

  getDashboardSnapshot(): Observable<StudentDashboardSnapshot> {
    if (!this.snapshotRequest$) {
      const headers = this.authService.getAuthHeaders();
      this.snapshotRequest$ = this.http.get<StudentDashboardSnapshot>(`${this.apiUrl}/student/dashboard`, { headers }).pipe(
        switchMap((snapshot) => this.enrichSnapshotFromDatabaseEvents(snapshot)),
        catchError(() => this.buildFallbackSnapshot()),
        tap((snapshot) => {
          this.setSnapshotCache(snapshot);
          this.profileRequest$ = undefined;
          this.eventsRequest$ = undefined;
          this.registrationsRequest$ = undefined;
        }),
        catchError((error) => {
          this.snapshotRequest$ = undefined;
          return throwError(() => error);
        }),
        shareReplay(1)
      );
    }

    return this.snapshotRequest$;
  }

  getProfile(): Observable<StudentProfile> {
    if (!this.profileRequest$) {
      this.profileRequest$ = this.getDashboardSnapshot().pipe(map((snapshot) => snapshot.profile));
    }

    return this.profileRequest$;
  }

  getEvents(): Observable<StudentEventCard[]> {
    if (!this.eventsRequest$) {
      this.eventsRequest$ = this.getDashboardSnapshot().pipe(map((snapshot) => snapshot.events));
    }

    return this.eventsRequest$;
  }

  getRegistrations(): Observable<StudentRegistrationRecord[]> {
    if (!this.registrationsRequest$) {
      this.registrationsRequest$ = this.getDashboardSnapshot().pipe(map((snapshot) => snapshot.registrations));
    }

    return this.registrationsRequest$;
  }

  registerForEvent(eventId: string): Observable<StudentRegistrationRecord> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentRegistrationRecord>(`${this.apiUrl}/registrations`, { eventId }, { headers }).pipe(
      tap(() => this.invalidateDashboardCache())
    );
  }

  cancelRegistration(eventId: string): Observable<{ message: string }> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ message: string }>(`${this.apiUrl}/registrations/student/me/event/${eventId}`, { headers }).pipe(
      tap(() => this.invalidateDashboardCache())
    );
  }

  getMyEventReviews(eventIds: string[]): Observable<StudentEventReview[]> {
    const headers = this.authService.getAuthHeaders();
    const ids = (eventIds || []).map((id) => String(id)).filter(Boolean);
    const query = ids.length ? `?eventIds=${encodeURIComponent(ids.join(','))}` : '';
    return this.http.get<StudentEventReview[]>(`${this.apiUrl}/event-reviews/mine${query}`, { headers }).pipe(
      catchError(() => of([]))
    );
  }

  // Calls the backend to save the user's 1-5 star rating
  submitEventRating(eventId: string, rating: number): Observable<StudentEventReview> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentEventReview>(`${this.apiUrl}/event-reviews/rating`, { eventId, rating }, { headers });
  }

  // Calls the backend to save the user's text feedback
  submitEventFeedback(eventId: string, feedback: string): Observable<StudentEventReview> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentEventReview>(`${this.apiUrl}/event-reviews/feedback`, { eventId, feedback }, { headers });
  }

  getMyProfileDetails(): Observable<StudentProfile> {
    const headers = this.authService.getAuthHeaders();
    return this.http.get<StudentProfile>(`${this.apiUrl}/profile/me`, { headers }).pipe(
      catchError(() => this.getProfile())
    );
  }

  updateMyProfile(payload: {
    name?: string;
    email?: string;
    college?: string;
    phone?: string;
    location?: string;
    department?: string;
    profileImageUrl?: string;
  }): Observable<StudentProfile> {
    const headers = this.authService.getAuthHeaders();
    return this.http.put<StudentProfile>(`${this.apiUrl}/profile/me`, payload, { headers }).pipe(
      tap(() => this.invalidateDashboardCache())
    );
  }

  getEventReviews(eventId: string): Observable<StudentEventReview[]> {
    const headers = this.authService.getAuthHeaders();
    const normalizedId = String(eventId || '').trim();
    if (!normalizedId) {
      return of([]);
    }

    return this.http.get<StudentEventReview[]>(`${this.apiUrl}/event-reviews/event/${encodeURIComponent(normalizedId)}`, { headers }).pipe(
      catchError(() =>
        this.http.get<StudentEventReview[]>(`${this.apiUrl}/event-reviews?eventId=${encodeURIComponent(normalizedId)}`, { headers }).pipe(
          catchError(() => this.getMyEventReviews([normalizedId]))
        )
      )
    );
  }

  deleteMyEventReview(eventId: string): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    const normalizedId = String(eventId || '').trim();
    if (!normalizedId) {
      return of(void 0);
    }

    return this.http.delete<void>(`${this.apiUrl}/event-reviews/event/${encodeURIComponent(normalizedId)}/mine`, { headers }).pipe(
      catchError(() =>
        this.http.delete<void>(`${this.apiUrl}/event-reviews/mine/${encodeURIComponent(normalizedId)}`, { headers }).pipe(
          catchError(() =>
            this.http.delete<void>(`${this.apiUrl}/event-reviews/${encodeURIComponent(normalizedId)}/mine`, { headers }).pipe(
              catchError(() => of(void 0))
            )
          )
        )
      )
    );
  }

  getEventComments(eventId: string): Observable<StudentEventComment[]> {
    const headers = this.authService.getAuthHeaders();
    const normalizedId = String(eventId || '').trim();
    if (!normalizedId) {
      return of([]);
    }

    return this.http.get<StudentEventComment[]>(`${this.apiUrl}/event-comments/event/${encodeURIComponent(normalizedId)}`, { headers }).pipe(
      catchError(() => of([]))
    );
  }

  postEventComment(eventId: string, text: string, parentCommentId?: string | null): Observable<StudentEventComment> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentEventComment>(`${this.apiUrl}/event-comments`, {
      eventId,
      text,
      parentCommentId: parentCommentId || null
    }, { headers });
  }

  updateEventComment(commentId: string, text: string): Observable<StudentEventComment> {
    const headers = this.authService.getAuthHeaders();
    return this.http.put<StudentEventComment>(`${this.apiUrl}/event-comments/${encodeURIComponent(commentId)}`, { text }, { headers });
  }

  deleteEventComment(commentId: string): Observable<{ message: string }> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ message: string }>(`${this.apiUrl}/event-comments/${encodeURIComponent(commentId)}`, { headers });
  }

  toggleEventCommentLike(commentId: string): Observable<StudentEventComment> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentEventComment>(`${this.apiUrl}/event-comments/${encodeURIComponent(commentId)}/like`, {}, { headers });
  }

  private enrichSnapshotFromDatabaseEvents(snapshot: StudentDashboardSnapshot): Observable<StudentDashboardSnapshot> {
    return this.eventService.fetchEvents().pipe(
      map((dbEvents) => ({
        ...snapshot,
        events: this.mergeEventsWithDatabase(snapshot.events || [], dbEvents || [])
      })),
      catchError(() => of(snapshot))
    );
  }

  private mergeEventsWithDatabase(events: StudentEventCard[], dbEvents: BackendEvent[]): StudentEventCard[] {
    const eventById = new Map<string, BackendEvent>();
    for (const dbEvent of dbEvents) {
      eventById.set(String(dbEvent.id), dbEvent);
    }

    return events.map((event) => {
      const dbEvent = eventById.get(String(event.id));
      if (!dbEvent) {
        return event;
      }

      const registrationDeadline = dbEvent.registrationDeadline ?? event.registrationDeadline ?? null;
      const deadlineDate = registrationDeadline ? new Date(registrationDeadline) : null;
      const registrationDeadlineLabel = deadlineDate && !Number.isNaN(deadlineDate.getTime())
        ? deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event.registrationDeadlineLabel || 'Not specified';

      return {
        ...event,
        registrationDeadline,
        registrationDeadlineLabel
      };
    });
  }

  invalidateDashboardCache(): void {
    this.snapshotRequest$ = undefined;
    this.eventsRequest$ = undefined;
    this.registrationsRequest$ = undefined;
    this.profileRequest$ = undefined;
  }

  resetDashboardState(): void {
    this.invalidateDashboardCache();
    this.cachedProfile = null;
    this.cachedEvents = [];
    this.cachedRegistrations = [];
    this.cachedStats = {
      upcomingEvents: 0,
      myRegistrations: 0,
      approvedEntries: 0
    };
    this.cachedNotifications = [];
    this.cachedSnapshot = null;
    localStorage.removeItem(this.snapshotStorageKey);
  }

  refreshDashboardSnapshot(): Observable<StudentDashboardSnapshot> {
    this.invalidateDashboardCache();
    return this.getDashboardSnapshot();
  }

  getCachedProfile(): StudentProfile | null {
    return this.cachedProfile;
  }

  getCachedEvents(): StudentEventCard[] {
    return this.cachedEvents;
  }

  getCachedRegistrations(): StudentRegistrationRecord[] {
    return this.cachedRegistrations;
  }

  getCachedStats(): StudentDashboardSnapshot['stats'] {
    return this.cachedStats;
  }

  getCachedNotifications(): StudentNotificationItem[] {
    return this.cachedNotifications;
  }

  getCachedSnapshot(): StudentDashboardSnapshot | null {
    return this.cachedSnapshot;
  }

  prefetchDashboard(): void {
    this.getDashboardSnapshot().subscribe({
      error: () => undefined
    });
  }

  getStatusTone(status: StudentRegistrationRecord['status']): 'approved' | 'pending' | 'rejected' {
    if (status === 'APPROVED') return 'approved';
    if (status === 'REJECTED') return 'rejected';
    return 'pending';
  }

  formatRegistrationStatus(status: StudentRegistrationRecord['status']): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  applyOptimisticRegistration(event: StudentEventCard, profile: StudentProfile | null): void {
    const existingSnapshot = this.cachedSnapshot;
    if (!existingSnapshot) {
      return;
    }

    const nowIso = new Date().toISOString();
    const eventLabel = event.title;
    const optimisticRegistration: StudentRegistrationRecord = {
      id: `optimistic-${event.id}`,
      eventId: event.id,
      eventName: event.title,
      studentId: profile?.id || '',
      studentName: profile?.name || 'Student',
      email: profile?.email || '',
      college: profile?.college || '',
      status: 'PENDING',
      rejectionReason: '',
      approvedAt: null,
      rejectedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      event: {
        id: event.id,
        name: event.title,
        dateTime: event.dateTime,
        location: event.location,
        organizer: event.organizer,
        contact: event.contact,
        description: event.description,
        category: event.category,
        posterDataUrl: event.imageUrl,
        status: event.status,
        registrations: event.registrations + 1,
        maxAttendees: event.maxAttendees,
        dateLabel: event.dateLabel
      }
    };

    const nextEvents: StudentEventCard[] = existingSnapshot.events.map((item) => {
      if (item.id !== event.id) {
        return item;
      }

      const nextRegistrations = item.registrations + 1;
      const nextStatus: StudentEventCard['status'] = 'Registered';
      return {
        ...item,
        registrations: nextRegistrations,
        status: nextStatus
      };
    });

    const nextRegistrations = [optimisticRegistration, ...existingSnapshot.registrations.filter((item) => item.eventId !== event.id)];

    this.setSnapshotCache({
      ...existingSnapshot,
      events: nextEvents,
      registrations: nextRegistrations,
      stats: {
        upcomingEvents: nextEvents.filter((item) => item.status !== 'Closed').length,
        myRegistrations: nextRegistrations.length,
        approvedEntries: nextRegistrations.filter((item) => item.status === 'APPROVED').length
      },
      notifications: [
        {
          id: `optimistic-registration-${event.id}`,
          title: 'Registration received',
          message: `Your request for ${eventLabel} has been submitted and is now waiting for admin approval.`,
          tone: 'info' as StudentNotificationTone,
          createdAt: nowIso,
          icon: 'hourglass_top',
          category: 'registration' as StudentNotificationCategory
        },
        ...existingSnapshot.notifications.filter((item) => item.id !== `optimistic-registration-${event.id}`)
      ].slice(0, 12)
    });
  }

  applyOptimisticCancellation(registration: StudentRegistrationRecord): void {
    const existingSnapshot = this.cachedSnapshot;
    if (!existingSnapshot) {
      return;
    }

    const nextRegistrations = existingSnapshot.registrations.filter((item) => item.eventId !== registration.eventId);
    const nextEvents: StudentEventCard[] = existingSnapshot.events.map((item) => {
      if (item.id !== registration.eventId) {
        return item;
      }

      return {
        ...item,
        registrations: Math.max(0, item.registrations - 1),
        status: (item.status === 'Registered' ? 'Open' : item.status) as StudentEventCard['status']
      };
    });

    this.setSnapshotCache({
      ...existingSnapshot,
      events: nextEvents,
      registrations: nextRegistrations,
      stats: {
        upcomingEvents: nextEvents.filter((item) => item.status !== 'Closed').length,
        myRegistrations: nextRegistrations.length,
        approvedEntries: nextRegistrations.filter((item) => item.status === 'APPROVED').length
      },
      notifications: [
        {
          id: `optimistic-cancel-${registration.eventId}`,
          title: 'Registration cancelled',
          message: `You cancelled ${registration.eventName}. You can register again if seats are still open.`,
          tone: 'warning' as StudentNotificationTone,
          createdAt: new Date().toISOString(),
          icon: 'event_busy',
          category: 'registration' as StudentNotificationCategory
        },
        ...existingSnapshot.notifications.filter((item) => item.id !== `optimistic-cancel-${registration.eventId}`)
      ].slice(0, 12)
    });
  }

  private setSnapshotCache(snapshot: StudentDashboardSnapshot): void {
    const normalizedEvents = (snapshot.events || []).map((event) => this.normalizeEventCard(event));
    const normalizedSnapshot: StudentDashboardSnapshot = {
      ...snapshot,
      events: normalizedEvents
    };

    this.cachedSnapshot = normalizedSnapshot;
    this.cachedProfile = normalizedSnapshot.profile;
    this.cachedEvents = normalizedSnapshot.events || [];
    this.cachedRegistrations = normalizedSnapshot.registrations || [];
    this.cachedStats = normalizedSnapshot.stats || this.cachedStats;
    this.cachedNotifications = normalizedSnapshot.notifications || [];
    localStorage.setItem(this.snapshotStorageKey, JSON.stringify(normalizedSnapshot));
  }

  private normalizeEventCard(event: StudentEventCard): StudentEventCard {
    const registrationDeadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;
    const registrationDeadlineLabel = event.registrationDeadlineLabel
      || (registrationDeadlineDate && !Number.isNaN(registrationDeadlineDate.getTime())
        ? registrationDeadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified');

    return {
      ...event,
      registrationDeadlineLabel
    };
  }

  private restoreSnapshotFromStorage(): void {
    const stored = localStorage.getItem(this.snapshotStorageKey);
    if (!stored) {
      return;
    }

    try {
      const snapshot = JSON.parse(stored) as StudentDashboardSnapshot;
      if (!snapshot || !this.isSnapshotForCurrentUser(snapshot)) {
        localStorage.removeItem(this.snapshotStorageKey);
        return;
      }

      this.cachedProfile = snapshot.profile || null;
      this.cachedEvents = Array.isArray(snapshot.events) ? snapshot.events.map((event) => this.normalizeEventCard(event)) : [];
      this.cachedRegistrations = Array.isArray(snapshot.registrations) ? snapshot.registrations : [];
      this.cachedStats = snapshot.stats || this.cachedStats;
      this.cachedNotifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
      this.cachedSnapshot = {
        profile: this.cachedProfile as StudentProfile,
        events: this.cachedEvents,
        registrations: this.cachedRegistrations,
        stats: this.cachedStats,
        notifications: this.cachedNotifications
      };
    } catch {
      localStorage.removeItem(this.snapshotStorageKey);
    }
  }

  private isSnapshotForCurrentUser(snapshot: StudentDashboardSnapshot): boolean {
    const currentUserRaw = localStorage.getItem(this.currentUserStorageKey);
    if (!currentUserRaw) {
      return false;
    }

    try {
      const currentUser = JSON.parse(currentUserRaw) as { userId?: string; email?: string };
      const snapshotUserId = snapshot.profile?.userId || '';
      const snapshotEmail = snapshot.profile?.email || '';
      return !!currentUser && (
        (!!currentUser.userId && currentUser.userId === snapshotUserId) ||
        (!!currentUser.email && currentUser.email === snapshotEmail)
      );
    } catch {
      return false;
    }
  }

  private buildFallbackSnapshot(): Observable<StudentDashboardSnapshot> {
    const headers = this.authService.getAuthHeaders();

    return forkJoin({
      profile: this.http.get<StudentProfile>(`${this.apiUrl}/me`, { headers }),
      events: this.eventService.fetchEvents().pipe(
        map((events) => events.map((event) => this.mapEvent(event)))
      ),
      registrations: this.http.get<StudentRegistrationRecord[]>(`${this.apiUrl}/registrations/student/me`, { headers }).pipe(
        catchError(() => of([] as StudentRegistrationRecord[]))
      )
    }).pipe(
      map(({ profile, events, registrations }) => {
        const stats = {
          upcomingEvents: events.filter((item) => item.status !== 'Closed').length,
          myRegistrations: registrations.length,
          approvedEntries: registrations.filter((item) => item.status === 'APPROVED').length
        };

        return {
          profile,
          events,
          registrations,
          stats,
          notifications: this.buildNotifications(profile, registrations, events, stats)
        };
      })
    );
  }

  private buildNotifications(
    profile: StudentProfile,
    registrations: StudentRegistrationRecord[],
    events: StudentEventCard[],
    stats: StudentDashboardSnapshot['stats']
  ): StudentNotificationItem[] {
    const base: StudentNotificationItem[] = [
      {
        id: 'registrations-count',
        title: 'Dashboard overview',
        message: `You have ${stats.myRegistrations} registrations and ${stats.approvedEntries} approved entries right now.`,
        tone: stats.approvedEntries > 0 ? 'success' : 'info',
        createdAt: new Date().toISOString(),
        icon: 'insights',
        category: 'overview'
      }
    ];

    const recentRegistrations: StudentNotificationItem[] = registrations.slice(0, 6).map((registration) => ({
      id: `registration-${registration.id}`,
      title: registration.status === 'APPROVED'
        ? 'Registration approved'
        : registration.status === 'REJECTED'
          ? 'Registration update'
          : 'Registration received',
      message: registration.status === 'APPROVED'
        ? `${registration.eventName} has been approved for you.`
        : registration.status === 'REJECTED'
          ? `${registration.eventName} was declined${registration.rejectionReason ? `: ${registration.rejectionReason}` : '.'}`
          : `${registration.eventName} is waiting for admin approval.`,
      tone: (registration.status === 'APPROVED' ? 'success' : registration.status === 'REJECTED' ? 'warning' : 'info') as StudentNotificationTone,
      createdAt: registration.approvedAt || registration.rejectedAt || registration.updatedAt || registration.createdAt,
      icon: registration.status === 'APPROVED' ? 'verified' : registration.status === 'REJECTED' ? 'report_problem' : 'hourglass_top',
      category: (registration.status === 'APPROVED' || registration.status === 'REJECTED' ? 'approval' : 'registration') as StudentNotificationCategory
    }));

    const collegeEvents: StudentNotificationItem[] = events
      .filter((event) => !profile.college || event.collegeName === profile.college)
      .slice(0, 4)
      .map((event) => ({
        id: `event-${event.id}`,
        title: profile.college ? 'New event from your college' : 'Live campus event',
        message: `${event.title} is live now${event.location ? ` at ${event.location}` : ''}.`,
        tone: 'info' as StudentNotificationTone,
        createdAt: event.dateTime,
        icon: 'campaign',
        category: 'event' as StudentNotificationCategory
      }));

    return [...base, ...recentRegistrations, ...collegeEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }

  private mapEvent(event: BackendEvent): StudentEventCard {
    const date = event.dateTime ? new Date(event.dateTime) : null;
    const registrationDeadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;

    return {
      id: event.id,
      title: event.name,
      description: event.description || 'Explore this campus experience and secure your seat before registrations close.',
      category: event.category || 'Campus Event',
      location: event.location || 'Campus Venue',
      dateTime: event.dateTime,
      registrationDeadline: event.registrationDeadline ?? null,
      registrationDeadlineLabel: registrationDeadlineDate && !Number.isNaN(registrationDeadlineDate.getTime())
        ? registrationDeadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified',
      endDate: event.endDate ?? null,
      dateLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event.dateTime,
      timeLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'Time TBA',
      imageUrl: event.posterDataUrl || null,
      organizer: event.organizer || 'Campus Event Hub',
      contact: event.contact || 'Contact admin',
      status: this.eventService.convertToFrontendEvent(event).status,
      registered: event.registered === true,
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees || event.participants || 100,
      collegeName: event.collegeName || 'Campus Event Hub'
    };
  }
}
