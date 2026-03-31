import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentEventReview,
  StudentNotificationItem,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { NotificationService } from '../services/notification.service';

interface EventRatingRow {
  eventId: string;
  eventName: string;
  rating: number;
  feedback: string;
  updatedAt: string;
}

@Component({
  selector: 'app-student-feedback-page',
  standalone: true,
  imports: [CommonModule, RouterModule, StudentHeaderComponent],
  templateUrl: './student-feedback-page.component.html',
  styleUrls: ['./student-feedback-page.component.scss']
})
export class StudentFeedbackPageComponent implements OnInit, OnDestroy {
  loading = true;
  errorMessage = '';
  overallAverage = 0;
  totalRatedEvents = 0;
  attendedEventsCount = 0;
  ratingRows: EventRatingRow[] = [];
  notifications: StudentNotificationItem[] = [];
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  unseenNotificationCount = 0;
  showNotificationViewMore = true;
  private feedbackRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private focusedEventId = '';
  private hasLoadedOnce = false;

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.prefillFromCache();
    this.route.queryParamMap.subscribe((params) => {
      this.focusedEventId = String(params.get('eventId') || '').trim();
      this.reorderRowsByFocus();
      this.refreshFeedback(this.hasLoadedOnce);
    });
    this.startFeedbackRefresh();
  }

  ngOnDestroy(): void {
    if (this.feedbackRefreshTimer) {
      clearInterval(this.feedbackRefreshTimer);
      this.feedbackRefreshTimer = null;
    }
  }

  get studentName(): string {
    return JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get hasRatings(): boolean {
    return this.ratingRows.length > 0;
  }

  get overallAverageLabel(): string {
    return this.totalRatedEvents ? this.overallAverage.toFixed(1) : '0.0';
  }

  get overallStars(): number[] {
    return [1, 2, 3, 4, 5];
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
  }

  openNotificationsPage(): void {
    this.notificationsDropdownOpen = false;
    this.router.navigate(['/student-notifications']);
  }

  deleteNotificationFromDropdown(id: string): void {
    if (!id) {
      return;
    }

    this.notificationService.deleteNotification(id).subscribe({
      next: () => {
        this.notifications = this.notifications.filter((item) => item.id !== id);
        this.unseenNotificationCount = this.notifications.length;
        this.cdr.detectChanges();
      },
      error: () => void 0
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  trackByEventId(_: number, item: EventRatingRow): string {
    return item.eventId;
  }

  formatDate(value: string): string {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Recently updated';
    }
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getStarIcon(position: number, value: number): 'star' | 'star_half' | 'star_border' {
    if (value >= position) return 'star';
    if (value >= position - 0.5) return 'star_half';
    return 'star_border';
  }

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private refreshFeedback(silent: boolean): void {
    if (!silent) {
      this.loading = true;
      this.cdr.detectChanges();
    }
    this.errorMessage = '';

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.loadNotifications();

        const events = snapshot.events || [];
        const attendedIds = this.buildAttendedEventIds(snapshot.registrations || []);
        this.attendedEventsCount = attendedIds.size;
        const eventIds = events.map((event) => String(event.id)).filter(Boolean);

        this.studentDashboardService.getMyEventReviews(eventIds).subscribe({
          next: (reviews) => {
            this.applyRows(events, reviews || []);
            this.loading = false;
            this.hasLoadedOnce = true;
            this.cdr.detectChanges();
          },
          error: () => {
            this.loading = false;
            this.hasLoadedOnce = true;
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        this.loading = false;
        this.hasLoadedOnce = true;
        this.errorMessage = error?.error?.message || 'Unable to load feedback summary right now.';
        this.cdr.detectChanges();
      }
    });
  }

  private applyRows(events: StudentEventCard[], reviews: StudentEventReview[]): void {
    const eventNameById = new Map<string, string>(
      (events || []).map((event) => [String(event.id), String(event.title || 'Event')])
    );

    const rows = (reviews || [])
      .map((review) => {
        const eventId = String(review.eventId || '');
        const rating = Number(review.rating || 0);
        if (!eventId || rating < 1 || rating > 5) {
          return null;
        }
        return {
          eventId,
          eventName: eventNameById.get(eventId) || 'Event',
          rating,
          feedback: String(review.feedback || '').trim(),
          updatedAt: String(review.updatedAt || review.createdAt || '')
        } as EventRatingRow;
      })
      .filter((row): row is EventRatingRow => !!row)
      .sort((a, b) => {
        const aFocused = this.focusedEventId && a.eventId === this.focusedEventId ? 1 : 0;
        const bFocused = this.focusedEventId && b.eventId === this.focusedEventId ? 1 : 0;
        if (aFocused !== bFocused) return bFocused - aFocused;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

    this.ratingRows = rows;
    this.totalRatedEvents = rows.length;
    if (!rows.length) {
      this.overallAverage = 0;
      return;
    }
    const total = rows.reduce((sum, row) => sum + row.rating, 0);
    this.overallAverage = Math.round((total / rows.length) * 10) / 10;
  }

  private buildAttendedEventIds(registrations: StudentRegistrationRecord[]): Set<string> {
    const now = Date.now();
    const ids = new Set<string>();

    for (const registration of registrations || []) {
      const eventId = String(registration?.eventId || '').trim();
      if (!eventId || registration?.status !== 'APPROVED') continue;

      const statusValue = String(registration?.event?.status || '').toLowerCase();
      if (statusValue === 'past' || statusValue === 'completed' || statusValue === 'closed') {
        ids.add(eventId);
        continue;
      }

      const dateRaw = String(registration?.event?.dateTime || '').trim();
      const ts = dateRaw ? new Date(dateRaw).getTime() : Number.NaN;
      if (!Number.isNaN(ts) && ts < now) {
        ids.add(eventId);
      }
    }

    return ids;
  }

  private prefillFromCache(): void {
    const snapshot = this.studentDashboardService.getCachedSnapshot();
    if (!snapshot) return;

    const cached = this.notificationService.getCachedDropdownState();
    this.notifications = (cached.items.length ? cached.items : snapshot.notifications || []) as StudentNotificationItem[];
    this.unseenNotificationCount = cached.unseenCount;
    this.showNotificationViewMore = cached.hasMore;
    this.notificationsLoading = this.notifications.length === 0;

    const events = snapshot.events || [];
    const attendedIds = this.buildAttendedEventIds(snapshot.registrations || []);
    this.attendedEventsCount = attendedIds.size;
    const eventIds = Array.from(attendedIds);
    if (!eventIds.length) {
      this.loading = false;
      return;
    }

    const localRatings = this.readRatingsFromLocalStorage();
    const eventNameById = new Map<string, string>(
      events.map((event) => [String(event.id), String(event.title || 'Event')])
    );
    const localRows: EventRatingRow[] = [];
    for (const eventId of eventIds) {
      const rating = Number(localRatings[eventId] || 0);
      if (rating < 1 || rating > 5) continue;
      localRows.push({
        eventId,
        eventName: eventNameById.get(eventId) || 'Event',
        rating,
        feedback: '',
        updatedAt: ''
      });
    }
    if (localRows.length) {
      this.ratingRows = localRows;
      this.totalRatedEvents = localRows.length;
      const total = localRows.reduce((sum, row) => sum + row.rating, 0);
      this.overallAverage = Math.round((total / localRows.length) * 10) / 10;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private readRatingsFromLocalStorage(): Record<string, number> {
    const userId = JSON.parse(localStorage.getItem('currentUser') || '{}')?.userId;
    if (!userId) return {};
    const raw = localStorage.getItem(`eventRatings:${String(userId)}`);
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

  private startFeedbackRefresh(): void {
    this.feedbackRefreshTimer = setInterval(() => {
      this.refreshFeedback(!this.hasLoadedOnce);
    }, 12000);
  }

  private loadNotifications(): void {
    this.notificationService.getDropdownNotifications(15).subscribe({
      next: (state) => {
        this.notifications = state.items as StudentNotificationItem[];
        this.unseenNotificationCount = state.unseenCount;
        this.showNotificationViewMore = state.hasMore;
        this.notificationsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => void 0
    });
  }


  private reorderRowsByFocus(): void {
    if (!this.ratingRows.length) return;
    this.ratingRows = [...this.ratingRows].sort((a, b) => {
      const aFocused = this.focusedEventId && a.eventId === this.focusedEventId ? 1 : 0;
      const bFocused = this.focusedEventId && b.eventId === this.focusedEventId ? 1 : 0;
      return bFocused - aFocused;
    });
  }
}
