import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
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
  loading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  errorMessage = '';
  actionEventId = '';
  searchQuery = '';
  selectedStatus = 'All';
  selectedDate = '';
  readonly statusOptions = ['All', 'PENDING', 'APPROVED', 'REJECTED'];
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;

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
}
