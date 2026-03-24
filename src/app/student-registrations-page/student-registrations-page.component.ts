import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { finalize, timeout } from 'rxjs';
import {
  StudentDashboardService,
  StudentDashboardSnapshot,
  StudentNotificationItem,
  StudentProfile,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';

@Component({
  selector: 'app-student-registrations-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent],
  templateUrl: './student-registrations-page.component.html',
  styleUrls: ['./student-registrations-page.component.scss']
})
export class StudentRegistrationsPageComponent implements OnInit, OnDestroy {
  profile: StudentProfile | null = null;
  registrations: StudentRegistrationRecord[] = [];
  filteredRegistrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  ratingDraftByEventId: Record<string, number> = {};
  savedRatingByEventId: Record<string, number> = {};
  feedbackDraftByEventId: Record<string, string> = {};
  savedFeedbackByEventId: Record<string, string> = {};
  feedbackOpenEventIds = new Set<string>();
  loading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  errorMessage = '';
  actionEventId = '';
  reviewActionEventId = '';
  searchQuery = '';
  selectedStatus = 'All';
  selectedDate = '';
  readonly statusOptions = ['All', 'PENDING', 'APPROVED', 'REJECTED'];
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  feedbackSavedEventIds = new Set<string>();
  private feedbackSavedTimerByEventId: Record<string, ReturnType<typeof setTimeout>> = {};

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.prefillFromCache();
    this.loadRegistrationsPage();
    this.startNotificationsRefresh();
  }

  ngOnDestroy(): void {
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
    }

    for (const timer of Object.values(this.feedbackSavedTimerByEventId)) {
      clearTimeout(timer);
    }
    this.feedbackSavedTimerByEventId = {};
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get featuredNotification(): StudentNotificationItem | null {
    return this.notifications[0] || null;
  }

  get remainingNotifications(): StudentNotificationItem[] {
    return this.notifications.slice(1);
  }

  get ratingChoices(): number[] {
    return [1, 2, 3, 4, 5];
  }

  get totalRegistrations(): number {
    return this.registrations.length;
  }

  get approvedCount(): number {
    return this.registrations.filter((item) => item.status === 'APPROVED').length;
  }

  get pendingCount(): number {
    return this.registrations.filter((item) => item.status === 'PENDING').length;
  }

  loadRegistrationsPage(): void {
    this.errorMessage = '';
    this.loading = !this.registrations.length;
    this.notificationsLoading = !this.notifications.length;

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.applySnapshot(snapshot);
      },
      error: (error) => {
        this.loading = false;
        this.notificationsLoading = false;
        if (!this.registrations.length) {
          this.errorMessage = error?.error?.message || 'Unable to load registrations right now.';
        }
      }
    });
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredRegistrations = this.registrations.filter((registration) => {
      const matchesQuery = !query
        || registration.eventName.toLowerCase().includes(query)
        || registration.event?.location?.toLowerCase().includes(query)
        || registration.college.toLowerCase().includes(query)
        || registration.status.toLowerCase().includes(query);

      const matchesStatus = this.selectedStatus === 'All' || registration.status === this.selectedStatus;
      const registrationDate = registration.event?.dateTime?.slice(0, 10) || registration.createdAt.slice(0, 10);
      const matchesDate = !this.selectedDate || registrationDate === this.selectedDate;

      return matchesQuery && matchesStatus && matchesDate;
    });
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedStatus = 'All';
    this.selectedDate = '';
    this.applyFilters();
  }

  navigate(path: 'dashboard' | 'events' | 'registrations' | 'feedback' | 'profile'): void {
    if (path === 'dashboard') {
      this.router.navigate(['/new-student-dashboard']);
      return;
    }
    if (path === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }
    if (path === 'registrations') {
      return;
    }
    if (path === 'feedback') {
      this.router.navigate(['/new-student-dashboard'], { fragment: 'feedback-section' });
      return;
    }
    this.router.navigate(['/student-profile']);
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
  }

  cancelRegistration(registration: StudentRegistrationRecord): void {
    const shouldCancel = window.confirm('Are you sure want to cancel from this event?');
    if (!shouldCancel) {
      return;
    }

    this.actionEventId = registration.eventId;
    this.studentDashboardService.applyOptimisticCancellation(registration);
    this.prefillFromCache();
    this.studentDashboardService.cancelRegistration(registration.eventId).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loadRegistrationsPage();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to cancel registration right now.';
        this.loadRegistrationsPage();
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  getRegistrationTone(status: StudentRegistrationRecord['status']): string {
    return this.studentDashboardService.getStatusTone(status);
  }

  getRegistrationStatusLabel(status: StudentRegistrationRecord['status']): string {
    return this.studentDashboardService.formatRegistrationStatus(status);
  }

  isEventCompleted(registration: StudentRegistrationRecord): boolean {
    const event = registration.event;
    const statusValue = String(event?.status || '').toLowerCase();
    if (statusValue === 'past' || statusValue === 'completed') {
      return true;
    }

    const eventTimestamp = event?.dateTime ? new Date(event.dateTime).getTime() : Number.NaN;
    if (!Number.isNaN(eventTimestamp)) {
      return eventTimestamp < Date.now();
    }

    return false;
  }

  shouldShowRating(registration: StudentRegistrationRecord): boolean {
    return registration.status === 'APPROVED' && this.isEventCompleted(registration);
  }

  getSavedRating(eventId: string): number | null {
    const value = this.savedRatingByEventId[eventId];
    return typeof value === 'number' && value > 0 ? value : null;
  }

  getSavedFeedback(eventId: string): string {
    return this.savedFeedbackByEventId[eventId] || '';
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

  submitRating(registration: StudentRegistrationRecord): void {
    const eventId = registration.eventId;
    const draft = this.ratingDraftByEventId[eventId] || 0;
    if (draft < 1 || draft > 5) {
      return;
    }

    this.errorMessage = '';

    // Optimistically update the UI immediately
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
        this.errorMessage = error?.error?.message || 'Failed to save rating to database.';
        console.error('Failed to save rating to DB', error);
      }
    });
  }

  toggleFeedback(eventId: string): void {
    if (this.feedbackOpenEventIds.has(eventId)) {
      this.feedbackOpenEventIds.delete(eventId);
      return;
    }

    const existing = this.getSavedFeedback(eventId);
    if (!this.feedbackDraftByEventId[eventId]) {
      this.feedbackDraftByEventId[eventId] = existing;
    }
    this.feedbackOpenEventIds.add(eventId);
  }

  submitFeedback(registration: StudentRegistrationRecord): void {
    const eventId = registration.eventId;
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
        this.errorMessage = error?.error?.message || 'Failed to save feedback to database.';
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

  trackById(_: number, item: StudentRegistrationRecord): string {
    return item.id;
  }

  trackNotification(_: number, item: StudentNotificationItem): string {
    return item.id;
  }

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private prefillFromCache(): void {
    const cachedSnapshot = this.studentDashboardService.getCachedSnapshot();
    const cachedProfile = this.studentDashboardService.getCachedProfile();
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
      this.applyFilters();
      this.loadSavedReviews();
      this.loading = false;
    }

    this.notifications = this.studentDashboardService.getCachedNotifications();
    this.notificationsLoading = false;
  }

  private applySnapshot(snapshot: StudentDashboardSnapshot): void {
    this.profile = snapshot.profile;
    this.registrations = snapshot.registrations || [];
    this.notifications = snapshot.notifications || [];
    this.applyFilters();
    this.loadSavedReviews();
    this.loading = false;
    this.notificationsLoading = false;
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.refreshDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.applySnapshot(snapshot);
        },
        error: () => undefined
      });
    }, 8000);
  }

  private loadSavedReviews(): void {
    const eventIds = (this.registrations || []).map((item) => String(item.eventId)).filter(Boolean);
    if (!eventIds.length) {
      this.savedRatingByEventId = {};
      this.savedFeedbackByEventId = {};
      return;
    }

    // 1. Instantly load ratings from local storage fallback to avoid UI flickering
    const storageKey = this.getRatingsStorageKey();
    if (storageKey) {
      try {
        const localRatings = this.readRatingsFromStorage(storageKey);
        for (const [k, v] of Object.entries(localRatings)) {
          if (v) this.savedRatingByEventId[k] = v;
        }
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
}
