import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { EventCardComponent } from '../shared/event-card/event-card.component';
import { finalize, timeout } from 'rxjs';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentDashboardSnapshot,
  StudentNotificationItem,
  StudentProfile,
  StudentRegistrationRecord,
  StudentEventReview
} from '../services/student-dashboard.service';

interface DashboardStat {
  title: string;
  count: number;
  icon: string;
  accent: string;
}

@Component({
  selector: 'app-student-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent, EventCardComponent],
  templateUrl: './student-dashboard-page.component.html',
  styleUrls: ['./student-dashboard-page.component.scss']
})
export class StudentDashboardPageComponent implements OnInit {
  profile: StudentProfile | null = null;
  allEvents: StudentEventCard[] = [];
  filteredEvents: StudentEventCard[] = [];
  registrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  categories: string[] = ['All'];
  colleges: string[] = ['All'];
  ratingDraftByEventId: Record<string, number> = {};
  savedRatingByEventId: Record<string, number> = {};
  feedbackDraftByEventId: Record<string, string> = {};
  savedFeedbackByEventId: Record<string, string> = {};
  eventRatingSummaryByEventId: Record<string, { average: number; count: number }> = {};
  feedbackOpenEventIds = new Set<string>();
  feedbackSavedEventIds = new Set<string>();
  statsState = {
    upcomingEvents: 0,
    myRegistrations: 0,
    approvedEntries: 0
  };

  searchQuery = '';
  selectedCategory = 'All';
  selectedCollege = 'All';
  selectedDate = '';
  loading = true;
  registrationsLoading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  actionEventId = '';
  reviewActionEventId = '';
  errorMessage = '';
  silentRefreshing = false;
  activeTab: 'dashboard' | 'events' | 'registrations' | 'feedback' = 'dashboard';
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private ratingRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private feedbackSavedTimerByEventId: Record<string, ReturnType<typeof setTimeout>> = {};
  private loadingRatingSummaryEventIds = new Set<string>();
  private ratingSummaryRetryCountByEventId: Record<string, number> = {};

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'feedback-section') {
        setTimeout(() => {
          document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    });
    this.prefillFromCache();
    this.loadDashboard();
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

    for (const timer of Object.values(this.feedbackSavedTimerByEventId)) {
      clearTimeout(timer);
    }
    this.feedbackSavedTimerByEventId = {};
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get profilePhotoUrl(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const value = String(
      currentUser.profileImageUrl
      || currentUser.profilePhotoUrl
      || currentUser.avatarUrl
      || currentUser.photoUrl
      || ''
    ).trim();
    return value || '';
  }

  get displayedEvents(): StudentEventCard[] {
    return this.filteredEvents.slice(0, 3);
  }

  get featuredNotification(): StudentNotificationItem | null {
    return this.notifications[0] || null;
  }

  get remainingNotifications(): StudentNotificationItem[] {
    return this.notifications.slice(1);
  }

  get stats(): DashboardStat[] {
    return [
      {
        title: 'Upcoming Events',
        count: this.statsState.upcomingEvents,
        icon: 'event_available',
        accent: 'violet'
      },
      {
        title: 'My Registrations',
        count: this.statsState.myRegistrations,
        icon: 'how_to_reg',
        accent: 'gold'
      },
      {
        title: 'Approved Entries',
        count: this.statsState.approvedEntries,
        icon: 'workspace_premium',
        accent: 'emerald'
      }
    ];
  }

  get ratingChoices(): number[] {
    return [1, 2, 3, 4, 5];
  }

  loadDashboard(): void {
    this.errorMessage = '';
    const hasWarmCache = !!this.studentDashboardService.getCachedSnapshot();
    if (!hasWarmCache) {
      this.loading = true;
      this.registrationsLoading = true;
      this.notificationsLoading = true;
    } else {
      this.silentRefreshing = true;
    }

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.applySnapshot(snapshot);
      },
      error: (error) => {
        this.loading = false;
        this.registrationsLoading = false;
        this.notificationsLoading = false;
        this.silentRefreshing = false;
        if (!this.allEvents.length && !this.registrations.length) {
          this.errorMessage = error?.error?.message || 'Unable to load student dashboard right now.';
        }
      }
    });
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredEvents = this.allEvents.filter((event) => {
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

  navigateTab(tab: 'dashboard' | 'events' | 'registrations' | 'feedback'): void {
    this.activeTab = tab;

    if (tab === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }

    if (tab === 'registrations') {
      this.router.navigate(['/student-registrations']);
      return;
    }

    if (tab === 'feedback') {
      this.router.navigate(['/student-feedback']);
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openProfile(): void {
    this.router.navigate(['/student-profile']);
  }

  viewAllEvents(): void {
    this.router.navigate(['/student-events']);
  }

  openRegistrationsPage(): void {
    this.router.navigate(['/student-registrations']);
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
  }

  registerForEvent(event: StudentEventCard): void {
    if (event.status !== 'Open' || this.isEventExpired(event)) {
      return;
    }

    this.actionEventId = event.id;
    this.studentDashboardService.applyOptimisticRegistration(event, this.profile);
    this.prefillFromCache();
    this.studentDashboardService.registerForEvent(event.id).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loadDashboard();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
        this.loadDashboard();
      }
    });
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

  isEventRegistered(event: StudentEventCard): boolean {
    return event.registered === true || String(event.status || '').toLowerCase() === 'registered';
  }

  isEventCompleted(event: StudentEventCard): boolean {
    return this.isEventExpired(event);
  }

  shouldShowRating(event: StudentEventCard): boolean {
    return this.isEventRegistered(event) && this.isEventCompleted(event);
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

  getSavedRating(eventId: string): number | null {
    const value = this.savedRatingByEventId[eventId];
    return typeof value === 'number' && value > 0 ? value : null;
  }

  getDraftRating(eventId: string): number {
    const saved = this.getSavedRating(eventId);
    if (saved) {
      return saved;
    }
    return this.ratingDraftByEventId[eventId] || 0;
  }

  setDraftRating(eventId: string, rating: number): void {
    if (rating < 1 || rating > 5) return;
    if (this.getSavedRating(eventId)) return;
    this.ratingDraftByEventId[eventId] = rating;
  }

  submitRating(event: StudentEventCard): void {
    const eventId = event.id;
    const draft = this.ratingDraftByEventId[eventId] || 0;
    if (draft < 1 || draft > 5) {
      return;
    }

    this.errorMessage = '';

    // Optimistically update the UI and localStorage immediately
    this.savedRatingByEventId[eventId] = draft;
    delete this.ratingDraftByEventId[eventId];
    
    const storageKey = this.getRatingsStorageKey();
    if (storageKey) {
      try {
        const existing = this.readRatingsFromStorage(storageKey);
        existing[eventId] = draft;
        localStorage.setItem(storageKey, JSON.stringify(existing));
      } catch {}
    }

    this.reviewActionEventId = eventId;
    
    // Call the backend service to save the rating in the database in the background
    this.studentDashboardService.submitEventRating(eventId, draft).pipe(
      timeout(8000),
      finalize(() => {
        if (this.reviewActionEventId === eventId) {
          this.reviewActionEventId = '';
        }
      })
    ).subscribe({
      next: (review) => {
        if (review && review.feedback) {
          this.savedFeedbackByEventId[eventId] = review.feedback;
        }
      },
      error: (error) => {
        console.error('Failed to save rating to DB', error);
      }
    });
  }

  toggleFeedback(eventId: string): void {
    if (this.feedbackOpenEventIds.has(eventId)) {
      this.feedbackOpenEventIds.delete(eventId);
      return;
    }

    const existing = this.savedFeedbackByEventId[eventId] || '';
    if (!this.feedbackDraftByEventId[eventId]) {
      this.feedbackDraftByEventId[eventId] = existing;
    }
    this.feedbackOpenEventIds.add(eventId);
  }

  submitFeedback(event: StudentEventCard): void {
    const eventId = event.id;
    const draft = String(this.feedbackDraftByEventId[eventId] || '').trim();
    if (draft.length < 3) {
      return;
    }

    this.errorMessage = '';

    // Optimistic UI update
    this.savedFeedbackByEventId[eventId] = draft;
    this.markFeedbackSaved(eventId);

    this.reviewActionEventId = eventId;
    // Send to database in background
    this.studentDashboardService.submitEventFeedback(eventId, draft).pipe(
      timeout(8000),
      finalize(() => {
        if (this.reviewActionEventId === eventId) {
          this.reviewActionEventId = '';
        }
      })
    ).subscribe({
      next: () => {},
      error: (error) => {
        console.error('Failed to save feedback to DB', error);
      }
    });
  }

  private markFeedbackSaved(eventId: string): void {
    this.feedbackSavedEventIds.add(eventId);

    const existingTimer = this.feedbackSavedTimerByEventId[eventId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.feedbackSavedTimerByEventId[eventId] = setTimeout(() => {
      this.feedbackSavedEventIds.delete(eventId);
      this.feedbackOpenEventIds.delete(eventId);
      delete this.feedbackSavedTimerByEventId[eventId];
    }, 1000);
  }

  trackById(_: number, item: StudentEventCard | StudentRegistrationRecord): string {
    return item.id;
  }

  trackNotification(_: number, item: StudentNotificationItem): string {
    return item.id;
  }

  formatNotificationTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Just now';
    }

    const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private prefillFromCache(): void {
    const cachedSnapshot = this.studentDashboardService.getCachedSnapshot();
    const cachedProfile = this.studentDashboardService.getCachedProfile();
    const cachedEvents = this.studentDashboardService.getCachedEvents();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();

    if (cachedSnapshot) {
      this.applySnapshot(cachedSnapshot);
      return;
    }

    if (cachedProfile) {
      this.profile = cachedProfile;
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
      this.registrationsLoading = false;
    }

    if (cachedEvents.length) {
      this.setEvents(cachedEvents);
      this.loading = false;
    }

    const cachedReviewEventIds = this.buildReviewEventIds(cachedEvents, cachedRegistrations);
    if (cachedReviewEventIds.length) {
      this.loadReviewsForEventIds(cachedReviewEventIds);
    }

    this.statsState = this.studentDashboardService.getCachedStats();
    this.notifications = this.studentDashboardService.getCachedNotifications();
    this.notificationsLoading = false;
  }

  private applySnapshot(snapshot: StudentDashboardSnapshot): void {
    this.profile = snapshot.profile;
    this.setEvents(snapshot.events);
    this.registrations = snapshot.registrations;

    const reviewEventIds = this.buildReviewEventIds(snapshot.events, snapshot.registrations);
    if (reviewEventIds.length) {
      this.loadReviewsForEventIds(reviewEventIds);
    }

    this.statsState = snapshot.stats;
    this.notifications = snapshot.notifications || [];
    
    this.loading = false;
    this.registrationsLoading = false;
    this.notificationsLoading = false;
    this.silentRefreshing = false;
  }

  private setEvents(events: StudentEventCard[]): void {
    this.allEvents = [...events].sort((a, b) => this.getEventTimestamp(b) - this.getEventTimestamp(a));
    this.categories = ['All', ...Array.from(new Set(this.allEvents.map((event) => event.category).filter(Boolean) as string[]))];
    this.colleges = ['All', ...Array.from(new Set(this.allEvents.map((event) => event.collegeName).filter(Boolean) as string[]))];
    this.applyFilters();
    this.loadVisibleEventRatingSummaries(this.allEvents, true);
  }

  private loadVisibleEventRatingSummaries(sourceEvents: StudentEventCard[] = this.displayedEvents, forceRefresh = false): void {
    const ids = sourceEvents
      .filter((event) => this.isEventCompleted(event))
      .map((event) => String(event.id))
      .filter((id) => !!id)
      .filter((id) => forceRefresh || !this.eventRatingSummaryByEventId[id]);

    if (!ids.length) {
      return;
    }

    for (const id of ids) {
      this.loadingRatingSummaryEventIds.add(id);
    }

    this.studentDashboardService.getEventRatingSummaries(ids).pipe(
      timeout(7000)
    ).subscribe({
      next: (summaries) => {
        const byEventId = new Map<string, { average: number; count: number }>();
        for (const item of summaries || []) {
          byEventId.set(String(item.eventId), {
            average: Number(item.average || 0),
            count: Number(item.count || 0)
          });
        }

        for (const id of ids) {
          this.eventRatingSummaryByEventId[id] = byEventId.get(id) || { average: 0, count: 0 };
          this.loadingRatingSummaryEventIds.delete(id);
          this.ratingSummaryRetryCountByEventId[id] = 0;
        }
      },
      error: () => {
        for (const id of ids) {
          this.loadingRatingSummaryEventIds.delete(id);
          const retries = (this.ratingSummaryRetryCountByEventId[id] || 0) + 1;
          this.ratingSummaryRetryCountByEventId[id] = retries;
          if (retries <= 2) {
            setTimeout(() => this.loadVisibleEventRatingSummaries(sourceEvents, true), 1200 * retries);
          } else {
            this.eventRatingSummaryByEventId[id] = { average: 0, count: 0 };
          }
        }
      }
    });
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

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.refreshDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.applySnapshot(snapshot);
        },
        error: () => void 0
      });
    }, 8000);
  }

  private startRatingsRefresh(): void {
    this.ratingRefreshTimer = setInterval(() => {
      this.loadVisibleEventRatingSummaries(this.allEvents, true);
    }, 8000);
  }

  private getRatingsStorageKey(): string | null {
    const userId = this.profile?.userId || JSON.parse(localStorage.getItem('currentUser') || '{}')?.userId;
    if (!userId) return null;
    return `eventRatings:${String(userId)}`;
  }

  private readRatingsFromStorage(storageKey: string): Record<string, number> {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && value >= 1 && value <= 5) {
          result[String(key)] = value;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private buildReviewEventIds(events: StudentEventCard[], registrations: StudentRegistrationRecord[]): string[] {
    return events
      .filter(event => this.shouldShowRating(event))
      .map(event => event.id);
  }

  private loadReviewsForEventIds(eventIds: string[]): void {
    if (!eventIds || !eventIds.length) {
      this.savedRatingByEventId = {};
      this.savedFeedbackByEventId = {};
      return;
    }

    // 1. Instantly load ratings from local storage fallback to avoid UI flickering
    const storageKey = this.getRatingsStorageKey();
    if (storageKey) {
      try {
        this.savedRatingByEventId = this.readRatingsFromStorage(storageKey);
      } catch {}
    }

    // 2. Fetch the actual ratings AND feedback from the database
    this.studentDashboardService.getMyEventReviews(eventIds).subscribe({
      next: (reviews) => {
        for (const review of reviews || []) {
          const eventId = String(review.eventId);
          if (!eventId) continue;
          if (review.rating) {
            this.savedRatingByEventId[eventId] = review.rating;
          }
          if (review.feedback) {
            this.savedFeedbackByEventId[eventId] = review.feedback;
          }
        }
      }
    });
  }
}
