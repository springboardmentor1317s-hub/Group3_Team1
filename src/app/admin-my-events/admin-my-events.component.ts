import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EventService, BackendEvent } from '../services/event.service';
import { AdminEventCardComponent } from '../shared/admin-event-card/admin-event-card.component';
import { StudentEventCard } from '../services/student-dashboard.service';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { isEventClosedByDate, parseEventLocalDay, resolveEventDateCandidate } from '../shared/event-date.util';
import { Auth } from '../auth/auth';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { buildAdminProfileIdentifiers, filterEventsOwnedByAdmin } from '../shared/admin-owned-events.util';
import { AuthService } from '../services/auth.service';

type DashboardTab = 'overview' | 'events' | 'payments' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries' | 'attendance';

@Component({
  selector: 'app-admin-my-events',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminEventCardComponent, AdminDashboardSidebarComponent, AdminCommonHeaderComponent],
  templateUrl: './admin-my-events.component.html',
  styleUrls: ['./admin-my-events.component.css']
})
export class AdminMyEventsComponent implements OnInit, OnDestroy {
  @ViewChild('dashboardSearchInput') private dashboardSearchInput?: ElementRef<HTMLInputElement>;

  loading = true;
  errorMessage = '';
  userName = 'College Admin';
  userAvatarUrl: string | null = null;
  sidebarCollapsed = false;
  dashboardSearchQuery = '';
  activeView: 'current' | 'old' = 'current';
  currentEventCards: StudentEventCard[] = [];
  oldEventCards: StudentEventCard[] = [];
  filteredCurrentEventCards: StudentEventCard[] = [];
  filteredOldEventCards: StudentEventCard[] = [];
  private cachedOwnedEvents: BackendEvent[] = [];
  private hasUsableCache = false;
  private hasResolvedInitialFetch = false;
  private adminIdentifiers: string[] = [];
  private cacheStorageKey = 'admin-my-events-cache';
  private readonly profileApiUrl = '/api/profile/me';
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly eventService: EventService,
    private readonly router: Router,
    private readonly auth: Auth,
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    this.userAvatarUrl = currentUser?.profileImageUrl || null;
    this.adminIdentifiers = this.buildIdentifiersFromSources(currentUser);
    this.cacheStorageKey = this.buildCacheStorageKey(currentUser);
    this.hydrateEventsFromCache();

    this.subscriptions.add(
      this.eventService.events$.subscribe((events) => {
        if (this.shouldIgnoreEmptyServiceEvents(events || [])) {
          return;
        }
        this.syncOwnedEvents(events || []);
      })
    );

    this.loadOwnedEvents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  trackByEventId(_index: number, event: StudentEventCard): string {
    return event.id;
  }

  get visibleEventCards(): StudentEventCard[] {
    return this.activeView === 'old' ? this.filteredOldEventCards : this.filteredCurrentEventCards;
  }

  get pageEyebrow(): string {
    return this.activeView === 'old' ? 'Closed Events' : 'Current Events';
  }

  get pageTitle(): string {
    return this.activeView === 'old'
      ? `${this.userName}'s Closed Events`
      : `${this.userName}'s Events`;
  }

  get pageDescription(): string {
    return this.activeView === 'old'
      ? 'All your closed events are shown here once their end date has passed.'
      : 'Your current and upcoming events appear here automatically.';
  }

  get emptyStateMessage(): string {
    return this.activeView === 'old'
      ? 'No closed events are available right now.'
      : 'No current events are available right now.';
  }

  setActiveView(view: 'current' | 'old'): void {
    this.activeView = view;
  }

  applyDashboardSearch(): void {
    const query = this.dashboardSearchQuery.trim().toLowerCase();
    if (!query) {
      this.filteredCurrentEventCards = [...this.currentEventCards];
      this.filteredOldEventCards = [...this.oldEventCards];
      return;
    }

    const matchesQuery = (event: StudentEventCard) =>
      [event.title, event.category, event.location, event.organizer, event.collegeName]
        .some((value) => String(value || '').toLowerCase().includes(query));

    this.filteredCurrentEventCards = this.currentEventCards.filter(matchesQuery);
    this.filteredOldEventCards = this.oldEventCards.filter(matchesQuery);
  }

  onDashboardSearchClick(): void {
    this.applyDashboardSearch();
    const input = this.dashboardSearchInput?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    }
  }

  exportEvents(): void {
    const rows = [
      ['Event Name', 'Category', 'Location', 'Date', 'Status', 'Registrations'],
      ...this.visibleEventCards.map((event) => [
        event.title,
        event.category,
        event.location,
        event.dateLabel,
        event.status,
        String(event.registrations)
      ])
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.activeView === 'old' ? 'my-closed-events.csv' : 'my-current-events.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  goToMyEvents(): void {
    this.router.navigate(['/admin-my-events']);
  }

  get avatarText(): string {
    const name = (this.userName || '').trim();
    if (!name) return 'U';
    return (name.split(/\s+/)[0] || 'U').charAt(0).toUpperCase();
  }

  goToDashboard(): void {
    this.router.navigate(['/admin-dashboard']);
  }

  handleTabChange(tab: DashboardTab): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  openCreateEvent(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events', create: 'true' } });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
  }

  private mapEventCard(event: BackendEvent): StudentEventCard {
    const resolvedDateValue = resolveEventDateCandidate(event as BackendEvent & Record<string, unknown>);
    const date = parseEventLocalDay(resolvedDateValue);
    const deadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;

    return {
      id: this.resolveEventId(event),
      title: event.name,
      description: event.description || 'Explore this campus experience and review its public discussion.',
      category: event.category || 'Campus Event',
      location: event.location || 'Campus Venue',
      dateTime: resolvedDateValue || event.dateTime,
      registrationDeadline: event.registrationDeadline ?? null,
      registrationDeadlineLabel: deadlineDate && !Number.isNaN(deadlineDate.getTime())
        ? deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified',
      dateLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event.dateTime,
      timeLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'Time TBA',
      imageUrl: event.posterDataUrl || null,
      organizer: event.organizer || 'Campus Event Hub',
      contact: event.contact || 'Contact admin',
      status: this.isPastEvent(event) ? 'Closed' : 'Open',
      isPaid: event.isPaid === true,
      amount: Number(event.amount || 0),
      currency: event.currency || 'INR',
      priceLabel: event.isPaid ? `${event.currency || 'INR'} ${Number(event.amount || 0).toFixed(2)}` : 'Free',
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees ?? null,
      collegeName: event.collegeName || 'Campus Event Hub',
      endDate: event.endDate ?? null
    };
  }

  private resolveEventId(event: BackendEvent): string {
    const fallbackId = (event as BackendEvent & Record<string, unknown>)['_id'];
    return String(event.id || fallbackId || '');
  }

  private syncOwnedEvents(events: BackendEvent[]): void {
    const ownedEvents = events || [];
    const currentEvents = ownedEvents
      .filter((event) => !this.isPastEvent(event))
      .sort((a, b) => this.getEventSortTime(a) - this.getEventSortTime(b));
    const oldEvents = ownedEvents
      .filter((event) => this.isPastEvent(event))
      .sort((a, b) => this.getEventSortTime(b) - this.getEventSortTime(a));

    this.currentEventCards = currentEvents.map((event) => this.mapEventCard(event));
    this.oldEventCards = oldEvents.map((event) => this.mapEventCard(event));
    this.applyDashboardSearch();
    this.loading = false;
  }

  private getEventSortTime(event: BackendEvent): number {
    const candidate = resolveEventDateCandidate(event as BackendEvent & Record<string, unknown>) || event.dateTime;
    const parsed = new Date(candidate || '');
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  private isPastEvent(event: BackendEvent): boolean {
    if (this.eventService.convertToFrontendEvent(event).status === 'Closed') return true;
    return isEventClosedByDate(event as BackendEvent & Record<string, unknown>);
  }

  private loadOwnedEvents(): void {
    this.subscriptions.add(
      forkJoin({
        profile: this.http.get<any>(this.profileApiUrl, { headers: this.authService.getAuthHeaders() }).pipe(
          catchError(() => of(null))
        ),
        myEvents: this.eventService.fetchMyEvents().pipe(
          catchError(() => of([] as BackendEvent[]))
        ),
        collegeEvents: this.eventService.fetchCollegeEvents().pipe(
          catchError(() => of([] as BackendEvent[]))
        )
      }).subscribe({
        next: ({ profile, myEvents, collegeEvents }) => {
          this.adminIdentifiers = this.buildIdentifiersFromSources(
            JSON.parse(localStorage.getItem('currentUser') || '{}'),
            profile
          );

          const mergedOwnedEvents = this.mergeOwnedEvents(myEvents || [], collegeEvents || []);
          if (!mergedOwnedEvents.length && this.cachedOwnedEvents.length) {
            this.syncOwnedEvents(this.cachedOwnedEvents);
            this.errorMessage = '';
            this.loading = false;
            return;
          }

          if (!mergedOwnedEvents.length && this.hasUsableCache) {
            this.loading = false;
            return;
          }

          this.syncOwnedEvents(mergedOwnedEvents);
          this.saveEventsToCache(mergedOwnedEvents);
          this.errorMessage = '';
          this.loading = false;
          this.hasResolvedInitialFetch = true;
        },
        error: () => {
          if (this.cachedOwnedEvents.length || this.hasUsableCache) {
            this.errorMessage = '';
            this.loading = false;
            this.hasResolvedInitialFetch = true;
            return;
          }

          this.errorMessage = 'Unable to load your events right now.';
          this.loading = false;
          this.hasResolvedInitialFetch = true;
        }
      })
    );
  }

  private buildIdentifiersFromSources(...sources: Array<Record<string, unknown> | null | undefined>): string[] {
    const identifiers = sources.flatMap((source) =>
      buildAdminProfileIdentifiers({
        id: (source as any)?.id || (source as any)?._id || null,
        userId: (source as any)?.userId || null,
        email: (source as any)?.email || null,
        name: (source as any)?.name || null,
        college: (source as any)?.college || (source as any)?.collegeName || null
      })
    );

    return Array.from(new Set(identifiers));
  }

  private mergeOwnedEvents(myEvents: BackendEvent[], collegeEvents: BackendEvent[]): BackendEvent[] {
    const filteredCollegeEvents = filterEventsOwnedByAdmin(collegeEvents || [], this.adminIdentifiers);
    const merged = new Map<string, BackendEvent>();

    [...(myEvents || []), ...filteredCollegeEvents].forEach((event) => {
      const id = this.resolveEventId(event);
      if (id) {
        merged.set(id, event);
      }
    });

    return Array.from(merged.values());
  }

  private buildCacheStorageKey(currentUser: Record<string, unknown>): string {
    const cacheUserId = String(
      currentUser?.['userId'] ||
      currentUser?.['id'] ||
      currentUser?.['_id'] ||
      currentUser?.['email'] ||
      'default'
    ).trim();

    return `admin-my-events-cache:${cacheUserId}`;
  }

  private hydrateEventsFromCache(): void {
    const cached = localStorage.getItem(this.cacheStorageKey);
    if (!cached) {
      return;
    }

    try {
      const parsed = JSON.parse(cached);
      if (!Array.isArray(parsed) || !parsed.length) {
        return;
      }

      this.cachedOwnedEvents = parsed as BackendEvent[];
      this.hasUsableCache = true;
      this.syncOwnedEvents(this.cachedOwnedEvents);
      this.loading = false;
    } catch {
      localStorage.removeItem(this.cacheStorageKey);
    }
  }

  private saveEventsToCache(events: BackendEvent[]): void {
    if (!events.length) {
      return;
    }

    try {
      this.cachedOwnedEvents = [...events];
      this.hasUsableCache = true;
      localStorage.setItem(this.cacheStorageKey, JSON.stringify(events || []));
    } catch {
      return;
    }
  }

  private shouldIgnoreEmptyServiceEvents(events: BackendEvent[]): boolean {
    if (events.length > 0) {
      return false;
    }

    if (this.hasUsableCache && !this.hasResolvedInitialFetch) {
      return true;
    }

    return this.loading && (this.currentEventCards.length > 0 || this.oldEventCards.length > 0);
  }
}
