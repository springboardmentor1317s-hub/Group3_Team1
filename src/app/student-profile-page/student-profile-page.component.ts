import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import {
  StudentDashboardService,
  StudentProfile,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';

@Component({
  selector: 'app-student-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule, SiteFooterComponent],
  templateUrl: './student-profile-page.component.html',
  styleUrls: ['./student-profile-page.component.scss']
})
export class StudentProfilePageComponent implements OnInit {
  profile: StudentProfile | null = null;
  registrations: StudentRegistrationRecord[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.prefillFromCache();
    this.loadProfile();
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

  openNotifications(): void {
    this.router.navigate(['/new-student-dashboard'], { fragment: 'notifications-section' });
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

  private prefillFromCache(): void {
    const cachedProfile = this.studentDashboardService.getCachedProfile();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();

    if (cachedProfile) {
      this.profile = cachedProfile;
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
    }

    if (this.profile || this.registrations.length) {
      this.loading = false;
    }
  }
}
