import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { BackendEvent, EventService } from './event.service';

export interface StudentProfile {
  id: string;
  name: string;
  userId: string;
  email: string;
  role: string;
  college: string;
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
  dateLabel: string;
  timeLabel: string;
  imageUrl: string | null;
  organizer: string;
  contact: string;
  status: 'Open' | 'Registered' | 'Full' | 'Closed';
  registrations: number;
  maxAttendees: number;
  collegeName: string;
}

export interface StudentNotificationItem {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
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

@Injectable({
  providedIn: 'root'
})
export class StudentDashboardService {
  private readonly apiUrl = '/api';
  private readonly snapshotStorageKey = 'studentDashboardSnapshot';
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

  invalidateDashboardCache(): void {
    this.snapshotRequest$ = undefined;
    this.eventsRequest$ = undefined;
    this.registrationsRequest$ = undefined;
    this.profileRequest$ = undefined;
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

  private setSnapshotCache(snapshot: StudentDashboardSnapshot): void {
    this.cachedProfile = snapshot.profile;
    this.cachedEvents = snapshot.events || [];
    this.cachedRegistrations = snapshot.registrations || [];
    this.cachedStats = snapshot.stats || this.cachedStats;
    this.cachedNotifications = snapshot.notifications || [];
    localStorage.setItem(this.snapshotStorageKey, JSON.stringify(snapshot));
  }

  private restoreSnapshotFromStorage(): void {
    const stored = localStorage.getItem(this.snapshotStorageKey);
    if (!stored) {
      return;
    }

    try {
      const snapshot = JSON.parse(stored) as StudentDashboardSnapshot;
      if (!snapshot) {
        return;
      }

      this.cachedProfile = snapshot.profile || null;
      this.cachedEvents = Array.isArray(snapshot.events) ? snapshot.events : [];
      this.cachedRegistrations = Array.isArray(snapshot.registrations) ? snapshot.registrations : [];
      this.cachedStats = snapshot.stats || this.cachedStats;
      this.cachedNotifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
    } catch {
      localStorage.removeItem(this.snapshotStorageKey);
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
          notifications: this.buildNotifications(stats)
        };
      })
    );
  }

  private buildNotifications(stats: StudentDashboardSnapshot['stats']): StudentNotificationItem[] {
    return [
      {
        id: 'registrations-count',
        title: 'Registration overview',
        message: `You have ${stats.myRegistrations} registrations and ${stats.approvedEntries} approved entries.`,
        tone: stats.approvedEntries > 0 ? 'success' : 'info'
      },
      {
        id: 'upcoming-events',
        title: 'Upcoming events',
        message: `${stats.upcomingEvents} live event opportunities are currently available for you.`,
        tone: stats.upcomingEvents > 0 ? 'info' : 'warning'
      }
    ];
  }

  private mapEvent(event: BackendEvent): StudentEventCard {
    const date = event.dateTime ? new Date(event.dateTime) : null;

    return {
      id: event.id,
      title: event.name,
      description: event.description || 'Explore this campus experience and secure your seat before registrations close.',
      category: event.category || 'Campus Event',
      location: event.location || 'Campus Venue',
      dateTime: event.dateTime,
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
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees || event.participants || 100,
      collegeName: event.collegeName || 'Campus Event Hub'
    };
  }
}
