
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { EventCardComponent } from '../shared/event-card/event-card.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { timeout } from 'rxjs';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentNotificationItem,
  StudentEventReview
} from '../services/student-dashboard.service';


@Component({
  selector: 'app-student-events-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent, EventCardComponent, StudentHeaderComponent],
  templateUrl: './student-events-page.component.html',
  styleUrls: ['./student-events-page.component.scss']
})
export class StudentEventsPageComponent implements OnInit, OnDestroy {
  events: StudentEventCard[] = [];
  filteredEvents: StudentEventCard[] = [];
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
  actionEventId = '';
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
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.focusEventId = params.get('focus') || '';
      this.scrollToFocusedEvent();
    });

    this.prefillFromCache();
    this.loadEvents();
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
    if (event.status !== 'Open' || this.isEventExpired(event)) {
      return;
    }

    this.actionEventId = event.id;
    this.studentDashboardService.registerForEvent(event.id).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loading = true;
        this.loadEvents();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
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
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  getRegisterLabel(event: StudentEventCard): string {
    const normalizedStatus = String(event.status || '').toLowerCase();
    if (this.isEventExpired(event)) {
      return 'Event Closed';
    }
    if (normalizedStatus === 'registered') {
      return 'Registered';
    }
    if (this.actionEventId === event.id) {
      return 'Joining...';
    }
    if (normalizedStatus === 'full') {
      return 'Full';
    }
    if (normalizedStatus === 'closed') {
      return 'Closed';
    }
    return 'Register Now';
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
    const cachedNotifications = this.studentDashboardService.getCachedNotifications();

    if (cachedEvents.length) {
      this.setEvents(cachedEvents);
      this.loading = false;
    }

    if (cachedNotifications.length) {
      this.notifications = cachedNotifications;
      this.notificationsLoading = false;
    }

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

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.notifications = snapshot.notifications || [];
        this.notificationsLoading = false;
        this.flushView();
      },
      error: () => {
        this.notifications = this.studentDashboardService.getCachedNotifications();
        this.notificationsLoading = false;
        this.flushView();
      }
    });
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.refreshDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.notifications = snapshot.notifications || [];
          this.notificationsLoading = false;
          this.flushView();
        },
        error: () => void 0
      });
    }, 8000);
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
