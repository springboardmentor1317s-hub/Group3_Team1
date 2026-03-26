import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent, StudentHeaderComponent],
  templateUrl: './student-profile-page.component.html',
  styleUrls: ['./student-profile-page.component.scss']
})
export class StudentProfilePageComponent implements OnInit, OnDestroy {
  profile: StudentProfile | null = null;
  registrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  loading = true;
  isEditing = false;
  isSaving = false;
  errorMessage = '';
  editError = '';
  selectedProfileImage: string | null = null;
  editForm = {
    name: '',
    email: '',
    college: '',
    phone: '',
    location: '',
    department: ''
  };
  notificationsLoading = true;
  notificationsDropdownOpen = false;
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

  get profilePhotoUrl(): string {
    if (this.selectedProfileImage) return this.selectedProfileImage;
    if (this.profile?.profileImageUrl) return this.profile.profileImageUrl;
    const seedName = this.profile?.name || this.studentName;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(seedName)}&background=1d4ed8&color=fff&bold=true`;
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
        this.syncEditForm(profile);
        profileLoaded = true;
        finishLoadingIfReady();
      },
      error: (error) => {
        this.profile = this.studentDashboardService.getCachedProfile();
        if (this.profile) {
          this.syncEditForm(this.profile);
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

    this.studentDashboardService.getMyProfileDetails().subscribe({
      next: (details) => {
        this.profile = {
          ...(this.profile || ({} as StudentProfile)),
          ...details
        };
        this.syncEditForm(this.profile);
      },
      error: () => undefined
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

  startEdit(): void {
    if (!this.profile) return;
    this.isEditing = true;
    this.editError = '';
    this.selectedProfileImage = this.profile.profileImageUrl || null;
    this.syncEditForm(this.profile);
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editError = '';
    this.selectedProfileImage = this.profile?.profileImageUrl || null;
    if (this.profile) {
      this.syncEditForm(this.profile);
    }
  }

  saveProfile(): void {
    if (!this.profile || this.isSaving) return;

    const payload = {
      name: this.editForm.name.trim(),
      email: this.editForm.email.trim(),
      college: this.editForm.college.trim(),
      phone: this.editForm.phone.trim(),
      location: this.editForm.location.trim(),
      department: this.editForm.department.trim(),
      profileImageUrl: this.selectedProfileImage || ''
    };

    if (!payload.name || !payload.email) {
      this.editError = 'Name and email are required.';
      return;
    }

    this.isSaving = true;
    this.editError = '';

    this.studentDashboardService.updateMyProfile(payload).subscribe({
      next: (updated) => {
        this.profile = {
          ...this.profile!,
          ...updated
        };
        this.isSaving = false;
        this.isEditing = false;
        this.selectedProfileImage = this.profile.profileImageUrl || null;
        this.syncEditForm(this.profile);
        this.persistCurrentUser(this.profile);
      },
      error: (error) => {
        this.isSaving = false;
        this.editError = error?.error?.message || 'Unable to save profile right now.';
      }
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.editError = 'Please choose an image file (JPG/PNG).';
      input.value = '';
      return;
    }

    const maxSizeBytes = 1.5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.editError = 'Please choose an image smaller than 1.5MB.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.selectedProfileImage = typeof reader.result === 'string' ? reader.result : null;
      this.editError = '';
    };
    reader.onerror = () => {
      this.editError = 'Could not read image file.';
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.selectedProfileImage = null;
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
      this.syncEditForm(cachedProfile);
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

  private syncEditForm(profile: StudentProfile): void {
    this.editForm = {
      name: String(profile?.name || ''),
      email: String(profile?.email || ''),
      college: String(profile?.college || ''),
      phone: String(profile?.phone || ''),
      location: String(profile?.location || ''),
      department: String(profile?.department || '')
    };
    this.selectedProfileImage = profile?.profileImageUrl || null;
  }

  private persistCurrentUser(profile: StudentProfile): void {
    const existing = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const merged = {
      ...existing,
      name: profile.name || existing.name,
      email: profile.email || existing.email,
      college: profile.college || existing.college,
      role: profile.role || existing.role,
      phone: profile.phone ?? existing.phone,
      location: profile.location ?? existing.location,
      department: profile.department ?? existing.department,
      profileImageUrl: profile.profileImageUrl ?? existing.profileImageUrl
    };
    localStorage.setItem('currentUser', JSON.stringify(merged));
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
