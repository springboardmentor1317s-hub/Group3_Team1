
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { EventCardComponent } from '../shared/event-card/event-card.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { timeout } from 'rxjs';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentNotificationItem,
  StudentEventReview,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';
import { NotificationService } from '../services/notification.service';


@Component({
  selector: 'app-student-events-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, EventCardComponent, StudentHeaderComponent],
  templateUrl: './student-events-page.component.html',
  styleUrls: ['./student-events-page.component.scss']
})
export class StudentEventsPageComponent implements OnInit, OnDestroy {
  events: StudentEventCard[] = [];
  filteredEvents: StudentEventCard[] = [];
  registrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  categories: string[] = ['All'];
  colleges: string[] = ['All'];
  searchQuery = '';
  selectedCategory = 'All';
  selectedCollege = 'All';
  selectedDate = '';
  loading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  unseenNotificationCount = 0;
  showNotificationViewMore = false;
  errorMessage = '';
  eventRatingSummaryByEventId: Record<string, { average: number; count: number }> = {};
  expandedEventIds = new Set<string>();
  private focusEventId = '';
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private ratingRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private loadingRatingSummaryEventIds = new Set<string>();
  private ratingSummaryRetryCountByEventId: Record<string, number> = {};

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.focusEventId = params.get('focus') || '';
      this.scrollToFocusedEvent();
    });

    this.prefillFromCache();
    this.loadEvents();
    this.loadRegistrationStatuses();
    this.loadNotifications();
    this.startNotificationsRefresh();
    this.startRatingsRefresh();
  }

  ngOnDestroy(): void {
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
    }
    if (this.ratingRefreshTimer) {
      clearInterval(this.ratingRefreshTimer);
      this.ratingRefreshTimer = null;
    }
  }

  get studentName(): string {
    return JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get profilePhotoUrl(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(
      currentUser.profileImageUrl
      || currentUser.profilePhotoUrl
      || currentUser.avatarUrl
      || currentUser.photoUrl
      || ''
    ).trim();
  }

  get hasVisibleEventsData(): boolean {
    return this.events.length > 0 || this.filteredEvents.length > 0;
  }

  loadEvents(): void {
    this.errorMessage = '';

    this.studentDashboardService.getEvents().pipe(
      timeout(9000)
    ).subscribe({
      next: (events) => {
        this.zone.run(() => {
          this.setEvents(events);
          this.loading = false;
          this.flushView();
          setTimeout(() => this.scrollToFocusedEvent(), 0);
        });
      },
      error: (error) => {
        this.zone.run(() => {
          this.prefillFromCache();
          this.setEvents(this.studentDashboardService.getCachedEvents());
          this.loading = false;
          if (!this.events.length) {
            this.errorMessage = error?.error?.message || 'Unable to load events right now.';
          }
          this.flushView();
        });
      }
    });
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredEvents = this.events.filter((event) => {
      const matchesQuery = !query
        || event.title.toLowerCase().includes(query)
        || event.description.toLowerCase().includes(query)
        || event.location.toLowerCase().includes(query)
        || (event.collegeName || '').toLowerCase().includes(query);
      const matchesCategory = this.selectedCategory === 'All' || event.category === this.selectedCategory;
      const matchesCollege = this.selectedCollege === 'All' || event.collegeName === this.selectedCollege;
      const matchesDate = !this.selectedDate || event.dateTime.slice(0, 10) === this.selectedDate;

      return matchesQuery && matchesCategory && matchesCollege && matchesDate;
    });

  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'All';
    this.selectedCollege = 'All';
    this.selectedDate = '';
    this.applyFilters();
  }

  registerForEvent(event: StudentEventCard): void {
    if (this.isRegisterDisabled(event)) {
      return;
    }

    const registration = this.studentDashboardService
      .getCachedRegistrations()
      .find((item) => item.eventId === event.id) || null;
    this.router.navigate(['/student-event-registration', event.id], {
      state: {
        event,
        registration
      }
    });
  }

  navigate(path: 'dashboard' | 'events' | 'registrations' | 'feedback' | 'profile'): void {
    if (path === 'dashboard') {
      this.router.navigate(['/new-student-dashboard']);
      return;
    }
    if (path === 'registrations') {
      this.router.navigate(['/student-registrations']);
      return;
    }
    if (path === 'feedback') {
      this.router.navigate(['/student-feedback']);
      return;
    }
    if (path === 'profile') {
      this.router.navigate(['/student-profile']);
      return;
    }
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
    if (this.notificationsDropdownOpen) {
      this.markAllNotificationsSeen();
    }
  }

  openNotificationsPage(): void {
    this.notificationsDropdownOpen = false;
    this.router.navigate(['/student-notifications']);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  getRegisterLabel(event: StudentEventCard): string {
    const normalizedStatus = String(event.status || '').toLowerCase();
    const registration = this.getRegistrationForEvent(event.id);
    if (registration?.status === 'APPROVED') {
      return 'Approved';
    }
    if (registration?.status === 'PENDING') {
      return 'Under Review';
    }
    if (this.hasRejectedRegistration(event.id)) {
      return 'Update & Resubmit';
    }
    if (this.isEventExpired(event)) {
      return 'Event Closed';
    }
    if (normalizedStatus === 'registered') {
      return 'Registered';
    }
    if (normalizedStatus === 'full') {
      return 'Full';
    }
    if (normalizedStatus === 'closed') {
      return 'Closed';
    }
    return 'Register Now';
  }

  hasRejectedRegistration(eventId: string): boolean {
    return this.getRegistrationForEvent(eventId)?.status === 'REJECTED';
  }

  isRegisterDisabled(event: StudentEventCard): boolean {
    if (this.isEventExpired(event)) {
      return true;
    }

    const normalizedStatus = String(event.status || '').toLowerCase();
    if (normalizedStatus === 'closed' || normalizedStatus === 'full') {
      return true;
    }

    const registration = this.getRegistrationForEvent(event.id);
    if (registration && registration.status !== 'REJECTED') {
      return true;
    }

    return false;
  }

  isEventCompleted(event: StudentEventCard): boolean {
    return this.isEventExpired(event);
  }

  getEventRatingAverage(eventId: string): number | null {
    const summary = this.eventRatingSummaryByEventId[eventId];
    return summary ? summary.average : null;
  }

  getEventRatingCount(eventId: string): number {
    return this.eventRatingSummaryByEventId[eventId]?.count || 0;
  }

  isRatingSummaryLoading(eventId: string): boolean {
    return this.loadingRatingSummaryEventIds.has(eventId);
  }





  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  trackById(_: number, item: StudentEventCard): string {
    return item.id;
  }

  private scrollToFocusedEvent(): void {
    if (!this.focusEventId) {
      return;
    }

    setTimeout(() => {
      document.getElementById(`event-${this.focusEventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  private prefillFromCache(): void {
    const cachedEvents = this.studentDashboardService.getCachedEvents();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();
    const cachedNotifications = this.studentDashboardService.getCachedNotifications();
    const cachedDropdownState = this.notificationService.getCachedDropdownState();

    if (cachedEvents.length) {
      this.setEvents(cachedEvents);
      this.loading = false;
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
    }

    this.notifications = (cachedDropdownState.items.length ? cachedDropdownState.items : cachedNotifications) as StudentNotificationItem[];
    this.unseenNotificationCount = cachedDropdownState.unseenCount;
    this.showNotificationViewMore = cachedDropdownState.hasMore;
    this.notificationsLoading = this.notifications.length === 0;

    this.flushView();
  }

  private setEvents(events: StudentEventCard[]): void {
    this.events = [...events].sort((a, b) => this.getEventTimestamp(b) - this.getEventTimestamp(a));
    this.categories = ['All', ...Array.from(new Set(this.events.map((event) => event.category).filter(Boolean)))];
    this.colleges = ['All', ...Array.from(new Set(this.events.map((event) => event.collegeName).filter(Boolean)))];
    this.applyFilters();
    this.loadVisibleEventRatingSummaries(this.events, true);
    this.flushView();
  }

  private loadVisibleEventRatingSummaries(sourceEvents: StudentEventCard[] = this.filteredEvents, forceRefresh = false): void {
    for (const event of sourceEvents) {
      if (!this.isEventCompleted(event)) {
        continue;
      }
      if (!forceRefresh && this.eventRatingSummaryByEventId[event.id]) {
        continue;
      }
      if (this.loadingRatingSummaryEventIds.has(event.id)) {
        continue;
      }
      this.fetchEventRatingSummary(event.id);
    }
  }

  private fetchEventRatingSummary(eventId: string): void {
    this.loadingRatingSummaryEventIds.add(eventId);

    this.studentDashboardService.getEventReviews(eventId).pipe(
      timeout(7000)
    ).subscribe({
      next: (reviews) => {
        const { average, count } = this.buildEventRatingSummary(reviews || []);
        this.eventRatingSummaryByEventId[eventId] = { average, count };
        this.ratingSummaryRetryCountByEventId[eventId] = 0;
        this.loadingRatingSummaryEventIds.delete(eventId);
      },
      error: () => {
        this.loadingRatingSummaryEventIds.delete(eventId);
        const retries = (this.ratingSummaryRetryCountByEventId[eventId] || 0) + 1;
        this.ratingSummaryRetryCountByEventId[eventId] = retries;

        if (retries <= 3) {
          setTimeout(() => {
            this.fetchEventRatingSummary(eventId);
          }, 1200 * retries);
          return;
        }

        this.eventRatingSummaryByEventId[eventId] = { average: 0, count: 0 };
      }
    });
  }

  private buildEventRatingSummary(reviews: StudentEventReview[]): { average: number; count: number } {
    const validRatings = (reviews || [])
      .map((review) => Number(review.rating || 0))
      .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

    if (!validRatings.length) {
      return { average: 0, count: 0 };
    }

    const total = validRatings.reduce((sum, rating) => sum + rating, 0);
    const average = Math.round((total / validRatings.length) * 10) / 10;
    return { average, count: validRatings.length };
  }

  private getEventTimestamp(event: StudentEventCard): number {
    const timestamp = new Date(event.dateTime).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
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

  private loadNotifications(): void {
    this.notificationsLoading = true;

    this.notificationService.getDropdownNotifications(15).subscribe({
      next: (state) => {
        this.notifications = state.items as StudentNotificationItem[];
        this.unseenNotificationCount = state.unseenCount;
        this.showNotificationViewMore = state.hasMore;
        this.notificationsLoading = false;
        this.flushView();
      },
      error: () => {
        const cached = this.notificationService.getCachedDropdownState();
        this.notifications = cached.items as StudentNotificationItem[];
        this.unseenNotificationCount = cached.unseenCount;
        this.showNotificationViewMore = cached.hasMore;
        this.notificationsLoading = false;
        this.flushView();
      }
    });
  }

  private loadRegistrationStatuses(): void {
    this.studentDashboardService.fetchLatestRegistrations().pipe(
      timeout(9000)
    ).subscribe({
      next: (registrations) => {
        this.registrations = registrations || [];
      },
      error: () => {
        this.registrations = this.studentDashboardService.getCachedRegistrations();
      }
    });
  }

  private getRegistrationForEvent(eventId: string): StudentRegistrationRecord | null {
    const source = this.registrations.length
      ? this.registrations
      : this.studentDashboardService.getCachedRegistrations();
    return source.find((item) => item.eventId === eventId) || null;
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.notificationService.getDropdownNotifications(15).subscribe({
        next: (state) => {
          this.notifications = state.items as StudentNotificationItem[];
          this.unseenNotificationCount = state.unseenCount;
          this.showNotificationViewMore = state.hasMore;
          this.notificationsLoading = false;
          this.flushView();
        },
        error: () => void 0
      });
    }, 8000);
  }

  private markAllNotificationsSeen(): void {
    this.notificationService.markAllSeen().subscribe({
      next: () => {
        this.unseenNotificationCount = 0;
        this.notifications = this.notifications.map((item) => ({ ...item, isSeen: true } as StudentNotificationItem));
        this.flushView();
      },
      error: () => void 0
    });
  }

  private startRatingsRefresh(): void {
    this.ratingRefreshTimer = setInterval(() => {
      this.loadVisibleEventRatingSummaries(this.filteredEvents, true);
    }, 8000);
  }

  private flushView(): void {
    this.cdr.detectChanges();
  }
}
