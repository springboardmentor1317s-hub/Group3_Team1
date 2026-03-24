import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, RouterModule, SiteFooterComponent, FormsModule],
  templateUrl: './student-profile-page.component.html',
  styleUrls: ['./student-profile-page.component.scss']
})
export class StudentProfilePageComponent implements OnInit {
  toastMessage = '';
  toastType: 'success' | 'error' | 'info' | null = null;
  showToast = false;

  showToastNotification(message: string, type: 'success' | 'error' | 'info'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }
  profile: StudentProfile | null = null;
  registrations: StudentRegistrationRecord[] = [];
  loading = true;
  errorMessage = '';
  isEditing = false;
  saveInProgress = false;
  editableProfile: Partial<StudentProfile> | null = null;
  sameAsCurrentAddress = false;

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
        this.editableProfile = { ...profile };
        profileLoaded = true;
        finishLoadingIfReady();
      },
      error: (error) => {
        this.profile = this.studentDashboardService.getCachedProfile();
        if (this.profile) {
          this.editableProfile = { ...this.profile };
        }
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

  startEditing(): void {
    this.isEditing = true;
    if (this.profile) {
      this.editableProfile = { ...this.profile };
    }
    this.sameAsCurrentAddress = !!this.profile?.permanentAddress?.sameAsCurrent;
  }

  onSameAsCurrentChange(): void {
    if (this.sameAsCurrentAddress && this.editableProfile && this.editableProfile.currentAddress) {
      this.editableProfile.permanentAddress = {
        ...this.editableProfile.currentAddress,
        sameAsCurrent: true
      };
    }
  }

  cancelEditing(): void {
    if (this.profile) {
      this.editableProfile = { ...this.profile };
    }
    this.isEditing = false;
  }

  get hasChanges(): boolean {
    if (!this.profile || !this.editableProfile) return false;
    return this.profile.name !== this.editableProfile.name || 
           this.profile.email !== this.editableProfile.email;
  }

  saveProfile(): void {
    if (!this.editableProfile) {
      this.showToastNotification('No profile data available', 'error');
      return;
    }

    // Client-side validation
    if (!this.editableProfile.name?.trim() || !this.editableProfile.email?.trim()) {
      this.showToastNotification('Name and email are required fields', 'error');
      this.saveInProgress = false;
      return;
    }

    if (!this.hasChanges) {
      this.showToastNotification('No changes detected', 'info');
      this.isEditing = false;
      return;
    }

    this.saveInProgress = true;
    this.errorMessage = '';

    const profileData: Partial<StudentProfile> = {
      name: this.editableProfile.name.trim(),
      email: this.editableProfile.email.trim()
    };

    this.studentDashboardService.updateProfile(profileData).subscribe({
      next: (updatedProfile) => {
        this.profile = updatedProfile;
        this.editableProfile = { ...updatedProfile };
        this.isEditing = false;
        this.saveInProgress = false;

        // Update localStorage currentUser for global sync
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const updatedUser = { ...currentUser, name: updatedProfile.name, email: updatedProfile.email };
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        this.showToastNotification('Profile updated successfully!', 'success');
        
        // Refresh dashboard to reflect changes everywhere
        this.studentDashboardService.refreshDashboardSnapshot().subscribe();
      },
      error: (error) => {
        const errorMsg = error?.error?.message || 'Failed to save profile. Please try again.';
        this.errorMessage = errorMsg;
        this.showToastNotification(errorMsg, 'error');
        this.saveInProgress = false;
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
      this.editableProfile = { ...cachedProfile };
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
    }

    if (this.profile || this.registrations.length) {
      this.loading = false;
    }
  }
}
