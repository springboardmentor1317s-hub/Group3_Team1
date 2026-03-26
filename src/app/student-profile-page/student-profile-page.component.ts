import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import {
  StudentDashboardService,
  StudentNotificationItem,
  StudentProfile,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';

@Component({
  selector: 'app-student-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule, SiteFooterComponent, StudentHeaderComponent],
  templateUrl: './student-profile-page.component.html',
  styleUrls: ['./student-profile-page.component.scss']
})
export class StudentProfilePageComponent implements OnInit, OnDestroy {
  profile: StudentProfile | null = null;
  registrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  loading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  errorMessage = '';
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.prefillFromCache();
    this.loadProfile();
    this.loadNotifications();
    this.startNotificationsRefresh();
  }

  ngOnDestroy(): void {
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
    }
  }

  get approvedCount(): number {
    return this.registrations.filter((item) => item.status === 'APPROVED').length;
  }

  get pendingCount(): number {
    return this.registrations.filter((item) => item.status === 'PENDING').length;
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  loadProfile(): void {
    this.errorMessage = '';

    let profileLoaded = false;
    let registrationsLoaded = false;

    const finishLoadingIfReady = () => {
      if (profileLoaded && registrationsLoaded) {
        this.loading = false;
      }
    };

    this.studentDashboardService.getProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        profileLoaded = true;
        finishLoadingIfReady();
      },
      error: (error) => {
        this.profile = this.studentDashboardService.getCachedProfile();
        profileLoaded = true;
        if (!this.profile) {
          this.errorMessage = error?.error?.message || 'Unable to load profile details right now.';
        }
        finishLoadingIfReady();
      }
    });

    this.studentDashboardService.getRegistrations().subscribe({
      next: (registrations) => {
        this.registrations = registrations;
        registrationsLoaded = true;
        finishLoadingIfReady();
      },
      error: () => {
        this.registrations = this.studentDashboardService.getCachedRegistrations();
        registrationsLoaded = true;
        finishLoadingIfReady();
      }
    });
  }

  goTo(path: 'dashboard' | 'events' | 'registrations' | 'feedback'): void {
    if (path === 'dashboard') {
      this.router.navigate(['/new-student-dashboard']);
      return;
    }
    if (path === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }
    if (path === 'feedback') {
      this.router.navigate(['/new-student-dashboard'], { fragment: 'feedback-section' });
      return;
    }
    this.router.navigate(['/student-registrations']);
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
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

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private prefillFromCache(): void {
    const cachedProfile = this.studentDashboardService.getCachedProfile();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();
    const cachedNotifications = this.studentDashboardService.getCachedNotifications();

    if (cachedProfile) {
      this.profile = cachedProfile;
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
    }

    if (cachedNotifications.length) {
      this.notifications = cachedNotifications;
      this.notificationsLoading = false;
    }

    if (this.profile || this.registrations.length) {
      this.loading = false;
    }
  }

  private loadNotifications(): void {
    this.notificationsLoading = true;

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.notifications = snapshot.notifications || [];
        this.notificationsLoading = false;
      },
      error: () => {
        this.notifications = this.studentDashboardService.getCachedNotifications();
        this.notificationsLoading = false;
      }
    });
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.refreshDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.notifications = snapshot.notifications || [];
          this.notificationsLoading = false;
        },
        error: () => void 0
      });
    }, 8000);
  }
}
