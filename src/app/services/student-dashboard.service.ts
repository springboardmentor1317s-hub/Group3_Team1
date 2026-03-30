import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, tap, throwError, timeout } from 'rxjs';
import { AuthService } from './auth.service';
import { BackendEvent, EventService } from './event.service';

export interface StudentProfile {
  id: string;
  name: string;
  userId: string;
  email: string;
  role: string;
  profileCompleted?: boolean;
  college: string;
  phone?: string;
  parentPhone?: string;
  gender?: string;
  dateOfBirth?: string;
  location?: string;
  department?: string;
  departmentOther?: string;
  currentClass?: string;
  semester?: string;
  currentCgpa?: string;
  currentState?: string;
  currentDistrict?: string;
  currentCity?: string;
  currentPincode?: string;
  currentAddressLine?: string;
  permanentState?: string;
  permanentDistrict?: string;
  permanentCity?: string;
  permanentPincode?: string;
  permanentAddressLine?: string;
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
  paymentRequired?: boolean;
  paymentStatus?: 'NOT_REQUIRED' | 'PENDING' | 'SUCCESS' | 'FAILED';
  paymentVerified?: boolean;
  paymentId?: string;
  orderId?: string;
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
    isPaid?: boolean;
    amount?: number;
    currency?: string;
    registrations: number;
    maxAttendees: number | null;
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
  isPaid?: boolean;
  amount?: number;
  currency?: string;
  priceLabel?: string;
  registrations: number;
  maxAttendees: number | null;
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

export interface StudentSupportQuery {
  id: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  progressNote: string;
  adminResponse: string;
  escalationRequested: boolean;
  escalatedAt: string | null;
  canCreateAnother: boolean;
  canDelete: boolean;
  canEscalate: boolean;
  ageInDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentSupportQuerySnapshot {
  activeQuery: StudentSupportQuery | null;
  latestResolvedQuery: StudentSupportQuery | null;
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
  private readonly snapshotTimeoutMs = 8000;
  private readonly secondaryTimeoutMs = 6000;
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
  private readonly maxStoredImageLength = 512;

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
        timeout(this.snapshotTimeoutMs),
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

  fetchLatestRegistrations(): Observable<StudentRegistrationRecord[]> {
    const headers = this.authService.getAuthHeaders();
    return this.http.get<StudentRegistrationRecord[]>(`${this.apiUrl}/registrations/student/me`, { headers }).pipe(
      catchError(() => of(this.getCachedRegistrations()))
    );
  }

  registerForEvent(eventId: string): Observable<StudentRegistrationRecord> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentRegistrationRecord>(`${this.apiUrl}/registrations`, { eventId }, { headers }).pipe(
      tap(() => this.invalidateDashboardCache())
    );
  }

  resubmitRegistration(eventId: string): Observable<StudentRegistrationRecord> {
    const headers = this.authService.getAuthHeaders();
    return this.http.patch<StudentRegistrationRecord>(
      `${this.apiUrl}/registrations/student/me/event/${encodeURIComponent(eventId)}/resubmit`,
      {},
      { headers }
    ).pipe(
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

  getMySupportQuery(): Observable<StudentSupportQuerySnapshot> {
    const headers = this.authService.getAuthHeaders();
    return this.http.get<StudentSupportQuerySnapshot>(`${this.apiUrl}/student-queries/me`, { headers });
  }

  createSupportQuery(subject: string, message: string): Observable<StudentSupportQuery> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentSupportQuery>(`${this.apiUrl}/student-queries`, { subject, message }, { headers });
  }

  deleteSupportQuery(queryId: string): Observable<{ message: string }> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ message: string }>(`${this.apiUrl}/student-queries/${encodeURIComponent(queryId)}`, { headers });
  }

  escalateSupportQuery(queryId: string): Observable<StudentSupportQuery> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<StudentSupportQuery>(`${this.apiUrl}/student-queries/${encodeURIComponent(queryId)}/escalate`, {}, { headers });
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
    parentPhone?: string;
    gender?: string;
    dateOfBirth?: string;
    location?: string;
    department?: string;
    departmentOther?: string;
    currentClass?: string;
    semester?: string;
    currentCgpa?: string;
    currentState?: string;
    currentDistrict?: string;
    currentCity?: string;
    currentPincode?: string;
    currentAddressLine?: string;
    permanentState?: string;
    permanentDistrict?: string;
    permanentCity?: string;
    permanentPincode?: string;
    permanentAddressLine?: string;
    profileImageUrl?: string;
  }): Observable<StudentProfile> {
    const headers = this.authService.getAuthHeaders();
    return this.http.put<StudentProfile>(`${this.apiUrl}/profile/me`, payload, { headers }).pipe(
      tap(() => this.invalidateDashboardCache())
    );
  }

  isProfileComplete(profile: Partial<StudentProfile> | null | undefined): boolean {
    if (!profile) {
      return false;
    }

    const department = String(profile.department || '').trim();
    const departmentOther = String(profile.departmentOther || '').trim();
    const requiredFields = [
      profile.name,
      profile.email,
      profile.college,
      profile.gender,
      profile.dateOfBirth,
      profile.phone,
      profile.currentClass,
      profile.semester,
      profile.currentCgpa,
      profile.currentState,
      profile.currentDistrict,
      profile.currentCity,
      profile.currentPincode,
      profile.currentAddressLine,
      profile.permanentState,
      profile.permanentDistrict,
      profile.permanentCity,
      profile.permanentPincode,
      profile.permanentAddressLine
    ];

    if (requiredFields.some((value) => !String(value || '').trim())) {
      return false;
    }

    if (!department) {
      return false;
    }

    if (department === 'Other' && !departmentOther) {
      return false;
    }

    return true;
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

  getEventRatingSummaries(eventIds: string[]): Observable<Array<{ eventId: string; average: number; count: number }>> {
    const headers = this.authService.getAuthHeaders();
    const ids = (eventIds || []).map((id) => String(id).trim()).filter(Boolean);
    if (!ids.length) {
      return of([]);
    }

    const query = `?eventIds=${encodeURIComponent(ids.join(','))}`;
    return this.http.get<Array<{ eventId: string; average: number; count: number }>>(
      `${this.apiUrl}/event-reviews/summary${query}`,
      { headers }
    ).pipe(
      catchError(() =>
        forkJoin(ids.map((id) =>
          this.getEventReviews(id).pipe(
            map((reviews) => {
              const validRatings = (reviews || [])
                .map((review) => Number(review.rating || 0))
                .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
              if (!validRatings.length) {
                return { eventId: id, average: 0, count: 0 };
              }
              const total = validRatings.reduce((sum, rating) => sum + rating, 0);
              return {
                eventId: id,
                average: Math.round((total / validRatings.length) * 10) / 10,
                count: validRatings.length
              };
            }),
            catchError(() => of({ eventId: id, average: 0, count: 0 }))
          )
        ))
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
      timeout(this.secondaryTimeoutMs),
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
        registrationDeadlineLabel,
        isPaid: dbEvent.isPaid === true,
        amount: Number(dbEvent.amount || 0),
        currency: dbEvent.currency || 'INR',
        priceLabel: dbEvent.isPaid ? `${dbEvent.currency || 'INR'} ${Number(dbEvent.amount || 0).toFixed(2)}` : 'Free'
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

  applyProfileUpdate(profile: StudentProfile): void {
    if (!profile) {
      return;
    }

    this.cachedProfile = profile;

    if (this.cachedSnapshot) {
      this.cachedSnapshot = {
        ...this.cachedSnapshot,
        profile
      };
      this.persistSnapshotToStorage(this.cachedSnapshot);
    }

    try {
      const currentUserRaw = localStorage.getItem(this.currentUserStorageKey);
      const existing = currentUserRaw ? JSON.parse(currentUserRaw) : {};
      localStorage.setItem(this.currentUserStorageKey, JSON.stringify({
        ...existing,
        name: profile.name || existing.name,
        email: profile.email || existing.email,
        profileCompleted: profile.profileCompleted ?? this.isProfileComplete(profile),
        college: profile.college || existing.college,
        role: profile.role || existing.role,
        phone: profile.phone ?? existing.phone,
        parentPhone: profile.parentPhone ?? existing.parentPhone,
        gender: profile.gender ?? existing.gender,
        dateOfBirth: profile.dateOfBirth ?? existing.dateOfBirth,
        location: profile.location ?? existing.location,
        department: profile.department ?? existing.department,
        departmentOther: profile.departmentOther ?? existing.departmentOther,
        currentClass: profile.currentClass ?? existing.currentClass,
        semester: profile.semester ?? existing.semester,
        currentCgpa: profile.currentCgpa ?? existing.currentCgpa,
        currentState: profile.currentState ?? existing.currentState,
        currentDistrict: profile.currentDistrict ?? existing.currentDistrict,
        currentCity: profile.currentCity ?? existing.currentCity,
        currentPincode: profile.currentPincode ?? existing.currentPincode,
        currentAddressLine: profile.currentAddressLine ?? existing.currentAddressLine,
        permanentState: profile.permanentState ?? existing.permanentState,
        permanentDistrict: profile.permanentDistrict ?? existing.permanentDistrict,
        permanentCity: profile.permanentCity ?? existing.permanentCity,
        permanentPincode: profile.permanentPincode ?? existing.permanentPincode,
        permanentAddressLine: profile.permanentAddressLine ?? existing.permanentAddressLine,
        profileImageUrl: profile.profileImageUrl ?? existing.profileImageUrl
      }));
    } catch {
      // Ignore localStorage parse issues and preserve the in-memory cache.
    }
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

  applyRegistrationUpdate(registration: StudentRegistrationRecord, event?: StudentEventCard | null): void {
    if (!registration) {
      return;
    }

    const normalizedRegistration: StudentRegistrationRecord = {
      ...registration,
      id: String(registration.id || ''),
      eventId: String(registration.eventId || ''),
      eventName: String(registration.eventName || event?.title || ''),
      studentId: String(registration.studentId || ''),
      studentName: String(registration.studentName || ''),
      email: String(registration.email || ''),
      college: String(registration.college || ''),
      status: registration.status === 'APPROVED' || registration.status === 'REJECTED' ? registration.status : 'PENDING',
      paymentRequired: Boolean(registration.paymentRequired),
      paymentStatus: registration.paymentStatus || 'NOT_REQUIRED',
      paymentVerified: Boolean(registration.paymentVerified),
      paymentId: String(registration.paymentId || ''),
      orderId: String(registration.orderId || ''),
      rejectionReason: String(registration.rejectionReason || ''),
      approvedAt: registration.approvedAt || null,
      rejectedAt: registration.rejectedAt || null,
      createdAt: String(registration.createdAt || new Date().toISOString()),
      updatedAt: String(registration.updatedAt || new Date().toISOString()),
      event: registration.event || (event ? {
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
        isPaid: event.isPaid === true,
        amount: Number(event.amount || 0),
        currency: event.currency || 'INR',
        registrations: event.registrations,
        maxAttendees: event.maxAttendees ?? null,
        dateLabel: event.dateLabel
      } : null)
    };

    const previousRegistration = this.cachedRegistrations.find((item) => item.eventId === normalizedRegistration.eventId) || null;
    const registrationWasRejected = previousRegistration?.status === 'REJECTED';
    const activeRegistrationDelta =
      normalizedRegistration.status === 'REJECTED'
        ? 0
        : previousRegistration?.status === 'REJECTED'
          ? 1
          : previousRegistration
            ? 0
            : 1;

    this.cachedRegistrations = [
      normalizedRegistration,
      ...this.cachedRegistrations.filter((item) => item.eventId !== normalizedRegistration.eventId)
    ];

    this.cachedEvents = this.cachedEvents.map((item) => {
      if (item.id !== normalizedRegistration.eventId) {
        return item;
      }

      const nextRegistrations = normalizedRegistration.status === 'REJECTED'
        ? Math.max(0, item.registrations - (previousRegistration && previousRegistration.status !== 'REJECTED' ? 1 : 0))
        : Math.max(item.registrations + activeRegistrationDelta, 0);
      const nextStatus: StudentEventCard['status'] = normalizedRegistration.status === 'REJECTED'
        ? (item.status === 'Closed' ? 'Closed' : 'Open')
        : 'Registered';

      return {
        ...item,
        registrations: nextRegistrations,
        status: nextStatus
      };
    });

    const existingSnapshot = this.cachedSnapshot;
    if (existingSnapshot) {
      const nextNotifications = normalizedRegistration.status === 'PENDING'
        ? [
            {
              id: `optimistic-registration-${normalizedRegistration.eventId}`,
              title: registrationWasRejected ? 'Application resubmitted' : 'Registration received',
              message: registrationWasRejected
                ? `Your updated request for ${normalizedRegistration.eventName} is back under admin review.`
                : `Your request for ${normalizedRegistration.eventName} has been submitted and is now waiting for admin approval.`,
              tone: 'info' as StudentNotificationTone,
              createdAt: normalizedRegistration.updatedAt,
              icon: 'hourglass_top',
              category: 'registration' as StudentNotificationCategory
            },
            ...existingSnapshot.notifications.filter((item) => item.id !== `optimistic-registration-${normalizedRegistration.eventId}`)
          ].slice(0, 12)
        : existingSnapshot.notifications;

      this.setSnapshotCache({
        ...existingSnapshot,
        events: this.cachedEvents,
        registrations: this.cachedRegistrations,
        stats: {
          upcomingEvents: this.cachedEvents.filter((item) => item.status !== 'Closed').length,
          myRegistrations: this.cachedRegistrations.length,
          approvedEntries: this.cachedRegistrations.filter((item) => item.status === 'APPROVED').length
        },
        notifications: nextNotifications
      });
      return;
    }

    this.persistSnapshotToStorage({
      profile: this.cachedProfile as StudentProfile,
      events: this.cachedEvents,
      registrations: this.cachedRegistrations,
      stats: {
        upcomingEvents: this.cachedEvents.filter((item) => item.status !== 'Closed').length,
        myRegistrations: this.cachedRegistrations.length,
        approvedEntries: this.cachedRegistrations.filter((item) => item.status === 'APPROVED').length
      },
      notifications: this.cachedNotifications
    });
  }

  applyOptimisticRegistration(event: StudentEventCard, profile: StudentProfile | null): void {
    const nowIso = new Date().toISOString();
    const optimisticRegistration: StudentRegistrationRecord = {
      id: `optimistic-${event.id}`,
      eventId: event.id,
      eventName: event.title,
      studentId: profile?.id || '',
      studentName: profile?.name || 'Student',
      email: profile?.email || '',
      college: profile?.college || '',
      status: 'PENDING',
      paymentRequired: Boolean(event.isPaid),
      paymentStatus: event.isPaid ? 'PENDING' : 'NOT_REQUIRED',
      paymentVerified: !event.isPaid,
      paymentId: '',
      orderId: '',
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
        isPaid: event.isPaid === true,
        amount: Number(event.amount || 0),
        currency: event.currency || 'INR',
        registrations: event.registrations + 1,
        maxAttendees: event.maxAttendees ?? null,
        dateLabel: event.dateLabel
      }
    };
    this.applyRegistrationUpdate({
      ...optimisticRegistration,
      updatedAt: nowIso
    }, event);
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
    this.persistSnapshotToStorage(normalizedSnapshot);
  }

  private persistSnapshotToStorage(snapshot: StudentDashboardSnapshot): void {
    const compactSnapshot = this.compactSnapshotForStorage(snapshot);
    try {
      localStorage.setItem(this.snapshotStorageKey, JSON.stringify(compactSnapshot));
      return;
    } catch {
      // Retry with a more compact fallback snapshot.
    }

    const minimalSnapshot = {
      ...compactSnapshot,
      notifications: [],
      events: compactSnapshot.events.map((event) => ({
        ...event,
        imageUrl: null
      }))
    } as StudentDashboardSnapshot;

    try {
      localStorage.setItem(this.snapshotStorageKey, JSON.stringify(minimalSnapshot));
    } catch {
      try {
        localStorage.removeItem(this.snapshotStorageKey);
      } catch {
        // Ignore storage failures and keep memory cache only.
      }
    }
  }

  private compactSnapshotForStorage(snapshot: StudentDashboardSnapshot): StudentDashboardSnapshot {
    const compactEvents = (snapshot.events || []).map((event) => ({
      ...event,
      description: String(event.description || '').slice(0, 400),
      imageUrl: this.compactImageValue(event.imageUrl)
    }));

    return {
      ...snapshot,
      events: compactEvents,
      notifications: (snapshot.notifications || []).slice(0, 8)
    };
  }

  private compactImageValue(value: string | null | undefined): string | null {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (normalized.length > this.maxStoredImageLength) {
      return null;
    }
    return normalized;
  }

  private normalizeEventCard(event: StudentEventCard): StudentEventCard {
    const registrationDeadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;
    const registrationDeadlineLabel = event.registrationDeadlineLabel
      || (registrationDeadlineDate && !Number.isNaN(registrationDeadlineDate.getTime())
        ? registrationDeadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified');
    const normalizedStatus: StudentEventCard['status'] = this.isEventExpired(event) ? 'Closed' : event.status;
    const isPaid = event.isPaid === true && Number(event.amount || 0) > 0;

    return {
      ...event,
      registrationDeadlineLabel,
      status: normalizedStatus,
      isPaid,
      amount: Number(event.amount || 0),
      currency: event.currency || 'INR',
      priceLabel: isPaid ? `${event.currency || 'INR'} ${Number(event.amount || 0).toFixed(2)}` : 'Free'
    };
  }

  private isEventExpired(event: StudentEventCard): boolean {
    const normalizedStatus = String(event.status || '').toLowerCase();
    if (normalizedStatus === 'closed' || normalizedStatus === 'completed' || normalizedStatus === 'past') {
      return true;
    }

    const parseDate = (value?: string | null): number => {
      if (!value) return Number.NaN;
      const trimmed = String(value).trim();
      if (!trimmed) return Number.NaN;

      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
      const parsed = new Date(isDateOnly ? `${trimmed}T23:59:59.999` : trimmed).getTime();
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    };

    const endTimestamp = parseDate(event.endDate);
    if (!Number.isNaN(endTimestamp)) {
      return endTimestamp < Date.now();
    }

    const startTimestamp = parseDate(event.dateTime);
    if (!Number.isNaN(startTimestamp)) {
      return startTimestamp < Date.now();
    }

    return false;
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
      const snapshotUserId = String(snapshot.profile?.userId || '').trim().toLowerCase();
      const snapshotEmail = String(snapshot.profile?.email || '').trim().toLowerCase();
      const currentUserId = String(currentUser.userId || '').trim().toLowerCase();
      const currentUserEmail = String(currentUser.email || '').trim().toLowerCase();

      if (!snapshotUserId && !snapshotEmail) {
        return !!this.cachedSnapshot || !!snapshot.profile;
      }

      return !!currentUser && (
        (!!currentUserId && currentUserId === snapshotUserId) ||
        (!!currentUserEmail && currentUserEmail === snapshotEmail)
      );
    } catch {
      return false;
    }
  }

  private buildFallbackSnapshot(): Observable<StudentDashboardSnapshot> {
    const headers = this.authService.getAuthHeaders();

    return forkJoin({
      profile: this.http.get<StudentProfile>(`${this.apiUrl}/profile/me`, { headers }).pipe(
        timeout(this.secondaryTimeoutMs),
        catchError(() => of(this.cachedProfile || this.buildProfileFromCurrentUser()))
      ),
      events: this.eventService.fetchEvents().pipe(
        timeout(this.secondaryTimeoutMs),
        map((events) => events.map((event) => this.mapEvent(event))),
        catchError(() => of(this.cachedEvents || []))
      ),
      registrations: this.http.get<StudentRegistrationRecord[]>(`${this.apiUrl}/registrations/student/me`, { headers }).pipe(
        timeout(this.secondaryTimeoutMs),
        catchError(() => of(this.cachedRegistrations || []))
      )
    }).pipe(
      map(({ profile, events, registrations }) => {
        const safeProfile = profile || this.buildProfileFromCurrentUser();
        const safeEvents = Array.isArray(events) ? events : [];
        const safeRegistrations = Array.isArray(registrations) ? registrations : [];
        const stats = {
          upcomingEvents: safeEvents.filter((item) => item.status !== 'Closed').length,
          myRegistrations: safeRegistrations.length,
          approvedEntries: safeRegistrations.filter((item) => item.status === 'APPROVED').length
        };

        return {
          profile: safeProfile,
          events: safeEvents,
          registrations: safeRegistrations,
          stats,
          notifications: this.buildNotifications(safeProfile, safeRegistrations, safeEvents, stats)
        };
      }),
      catchError(() => {
        const fallbackProfile = this.cachedProfile || this.buildProfileFromCurrentUser();
        const fallbackEvents = this.cachedEvents || [];
        const fallbackRegistrations = this.cachedRegistrations || [];
        const fallbackStats = this.cachedSnapshot?.stats || {
          upcomingEvents: fallbackEvents.filter((item) => item.status !== 'Closed').length,
          myRegistrations: fallbackRegistrations.length,
          approvedEntries: fallbackRegistrations.filter((item) => item.status === 'APPROVED').length
        };

        return of({
          profile: fallbackProfile,
          events: fallbackEvents,
          registrations: fallbackRegistrations,
          stats: fallbackStats,
          notifications: this.cachedNotifications?.length
            ? this.cachedNotifications
            : this.buildNotifications(fallbackProfile, fallbackRegistrations, fallbackEvents, fallbackStats)
        });
      })
    );
  }

  private buildProfileFromCurrentUser(): StudentProfile {
    try {
      const currentUser = JSON.parse(localStorage.getItem(this.currentUserStorageKey) || '{}');
      const now = new Date().toISOString();
      return {
        id: String(currentUser.id || currentUser._id || currentUser.userId || ''),
        name: String(currentUser.name || 'Student'),
        userId: String(currentUser.userId || currentUser.id || currentUser._id || ''),
        email: String(currentUser.email || ''),
        role: String(currentUser.role || 'student'),
        profileCompleted: Boolean(currentUser.profileCompleted),
        college: String(currentUser.college || ''),
        phone: String(currentUser.phone || ''),
        parentPhone: String(currentUser.parentPhone || ''),
        gender: String(currentUser.gender || ''),
        dateOfBirth: String(currentUser.dateOfBirth || ''),
        location: String(currentUser.location || ''),
        department: String(currentUser.department || ''),
        departmentOther: String(currentUser.departmentOther || ''),
        currentClass: String(currentUser.currentClass || ''),
        semester: String(currentUser.semester || ''),
        currentCgpa: String(currentUser.currentCgpa || ''),
        currentState: String(currentUser.currentState || ''),
        currentDistrict: String(currentUser.currentDistrict || ''),
        currentCity: String(currentUser.currentCity || ''),
        currentPincode: String(currentUser.currentPincode || ''),
        currentAddressLine: String(currentUser.currentAddressLine || ''),
        permanentState: String(currentUser.permanentState || ''),
        permanentDistrict: String(currentUser.permanentDistrict || ''),
        permanentCity: String(currentUser.permanentCity || ''),
        permanentPincode: String(currentUser.permanentPincode || ''),
        permanentAddressLine: String(currentUser.permanentAddressLine || ''),
        profileImageUrl: String(currentUser.profileImageUrl || currentUser.profilePhotoUrl || currentUser.avatarUrl || currentUser.photoUrl || ''),
        createdAt: String(currentUser.createdAt || now),
        updatedAt: String(currentUser.updatedAt || now)
      };
    } catch {
      const now = new Date().toISOString();
      return {
        id: '',
        name: 'Student',
        userId: '',
        email: '',
        role: 'student',
        profileCompleted: false,
        college: '',
        phone: '',
        parentPhone: '',
        gender: '',
        dateOfBirth: '',
        location: '',
        department: '',
        departmentOther: '',
        currentClass: '',
        semester: '',
        currentCgpa: '',
        currentState: '',
        currentDistrict: '',
        currentCity: '',
        currentPincode: '',
        currentAddressLine: '',
        permanentState: '',
        permanentDistrict: '',
        permanentCity: '',
        permanentPincode: '',
        permanentAddressLine: '',
        profileImageUrl: '',
        createdAt: now,
        updatedAt: now
      };
    }
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
      isPaid: event.isPaid === true,
      amount: Number(event.amount || 0),
      currency: event.currency || 'INR',
      priceLabel: event.isPaid ? `${event.currency || 'INR'} ${Number(event.amount || 0).toFixed(2)}` : 'Free',
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees ?? null,
      collegeName: event.collegeName || 'Campus Event Hub'
    };
  }
}
