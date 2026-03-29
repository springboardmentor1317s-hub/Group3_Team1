import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { finalize, timeout } from 'rxjs/operators';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { Auth } from '../auth/auth';
import { DEPARTMENT_OPTIONS } from '../student-profile-page/profile-form-options';

interface AdminProfileResponse {
  id: string;
  name: string;
  userId: string;
  email: string;
  role: string;
  college: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  location?: string;
  currentState?: string;
  currentDistrict?: string;
  currentCity?: string;
  department?: string;
  departmentOther?: string;
  profileCompleted?: boolean;
  profileImageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AdminEventSummary {
  id: string;
  status?: string;
  registrations?: number;
  maxAttendees?: number | null;
}

@Component({
  selector: 'app-admin-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminCommonHeaderComponent],
  templateUrl: './admin-profile-page.html',
  styleUrls: ['./admin-profile-page.css']
})
export class AdminProfilePageComponent implements OnInit {
  private readonly PROFILE_API = '/api/profile/me';
  private readonly EVENTS_API = '/api/events/college';
  private readonly CHANGE_PASSWORD_API = '/api/profile/me/change-password';

  readonly departmentOptions = DEPARTMENT_OPTIONS;

  userName = 'College Admin';
  userId = '';
  email = 'admin@college.edu';
  college = 'Campus Event Hub';
  role = 'College Admin';
  phone = '';
  gender = '';
  dateOfBirth = '';
  location = '';
  currentState = '';
  currentDistrict = '';
  currentCity = '';
  department = '';
  departmentOther = '';
  profileImageUrl: string | null = null;
  joinedOn = 'Recently';
  lastUpdatedOn = 'Not available';

  isEditing = false;
  isSaving = false;
  isLoading = false;
  isStatsLoading = false;
  isChangingPassword = false;
  passwordPanelOpen = false;

  totalEvents = 0;
  activeEvents = 0;
  totalRegistrations = 0;
  unlimitedEvents = 0;

  saveError = '';
  saveSuccess = '';
  passwordError = '';
  passwordSuccess = '';

  editForm = this.getEmptyEditForm();
  passwordForm = this.getEmptyPasswordForm();

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: Auth
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('requireProfileUpdate') === '1') {
        this.saveError = 'Please complete your profile before accessing the dashboard.';
      }
    });
    this.hydrateFromLocalStorage();
    this.fetchProfile();
    this.fetchEventStats();
  }

  get displayDepartment(): string {
    if (this.department === 'Other' && this.departmentOther.trim()) {
      return this.departmentOther.trim();
    }
    return this.department || 'Not added yet';
  }

  get profileStatusLabel(): string {
    const completedFields = [
      this.userName,
      this.email,
      this.college,
      this.phone,
      this.gender,
      this.dateOfBirth,
      this.currentState,
      this.currentDistrict,
      this.currentCity
    ].filter((value) => String(value || '').trim()).length;

    if (this.saveSuccess) return 'Profile updated';
    if (completedFields >= 9) return 'Profile active';
    return 'Profile setup pending';
  }

  get hasRealtimeUpdatedOn(): boolean {
    return this.lastUpdatedOn !== 'Not available';
  }

  startEdit(): void {
    this.saveError = '';
    this.saveSuccess = '';
    this.isEditing = true;
    this.resetEditForm();
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.saveError = '';
    this.resetEditForm();
  }

  saveProfile(): void {
    if (this.isSaving) return;

    this.saveError = '';
    this.saveSuccess = '';

    const payload = {
      phone: this.editForm.phone.trim(),
      dateOfBirth: this.editForm.dateOfBirth.trim(),
      gender: this.editForm.gender.trim(),
      location: this.editForm.location.trim(),
      currentState: this.editForm.currentState.trim(),
      currentDistrict: this.editForm.currentDistrict.trim(),
      currentCity: this.editForm.currentCity.trim(),
      department: this.editForm.department.trim(),
      departmentOther: this.editForm.department === 'Other' ? this.editForm.departmentOther.trim() : '',
      profileImageUrl: this.profileImageUrl
    };

    if (!payload.phone) {
      this.saveError = 'Phone is required.';
      return;
    }

    if (payload.department === 'Other' && !payload.departmentOther) {
      this.saveError = 'Please enter your department name.';
      return;
    }

    this.isSaving = true;

    this.http.put<AdminProfileResponse>(this.PROFILE_API, payload, { headers: this.getAuthHeaders() }).pipe(
      timeout(8000),
      finalize(() => {
        this.isSaving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.http.get<AdminProfileResponse>(this.PROFILE_API, { headers: this.getAuthHeaders() }).subscribe({
          next: (profile) => {
            this.applyProfile(profile);
            this.persistToLocalStorage(profile);
            this.isEditing = false;
            this.saveSuccess = 'Profile updated successfully.';
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.saveError = err?.error?.message || 'Profile updated, but latest data could not be reloaded.';
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.saveError = err?.name === 'TimeoutError'
          ? 'Profile save took too long. Please try again.'
          : err?.error?.message || 'Could not update the profile right now.';
        this.cdr.detectChanges();
      }
    });
  }

  togglePasswordPanel(): void {
    this.passwordPanelOpen = !this.passwordPanelOpen;
    this.passwordError = '';
    this.passwordSuccess = '';
    if (!this.passwordPanelOpen) {
      this.passwordForm = this.getEmptyPasswordForm();
    }
  }

  changePassword(): void {
    if (this.isChangingPassword) return;

    this.passwordError = '';
    this.passwordSuccess = '';

    const payload = {
      currentPassword: this.passwordForm.currentPassword.trim(),
      newPassword: this.passwordForm.newPassword.trim(),
      confirmPassword: this.passwordForm.confirmPassword.trim()
    };

    if (!payload.currentPassword || !payload.newPassword || !payload.confirmPassword) {
      this.passwordError = 'Please fill all password fields.';
      return;
    }

    if (payload.newPassword.length < 6) {
      this.passwordError = 'New password must be at least 6 characters long.';
      return;
    }

    if (payload.newPassword !== payload.confirmPassword) {
      this.passwordError = 'New password and confirm password must match.';
      return;
    }

    this.isChangingPassword = true;
    this.http.patch<{ message: string }>(this.CHANGE_PASSWORD_API, payload, { headers: this.getAuthHeaders() }).subscribe({
      next: (response) => {
        this.isChangingPassword = false;
        this.passwordSuccess = response?.message || 'Password updated successfully.';
        this.passwordForm = this.getEmptyPasswordForm();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isChangingPassword = false;
        this.passwordError = err?.error?.message || 'Could not change password right now.';
        this.cdr.detectChanges();
      }
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.saveError = 'Please choose a JPG or PNG image.';
      input.value = '';
      return;
    }

    const maxSizeBytes = 1.5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.saveError = 'Please choose an image smaller than 1.5 MB.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.profileImageUrl = typeof reader.result === 'string' ? reader.result : null;
      this.cdr.detectChanges();
    };
    reader.onerror = () => {
      this.saveError = 'Could not read the selected image.';
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  goToDashboard(): void {
    this.router.navigate(['/admin-dashboard']);
  }

  handleTabChange(tab: 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries'): void {
    if (tab === 'registrations') {
      this.router.navigate(['/admin-registration-details']);
      return;
    }
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private fetchProfile(): void {
    this.isLoading = true;
    this.http.get<AdminProfileResponse>(this.PROFILE_API, { headers: this.getAuthHeaders() }).subscribe({
      next: (profile) => {
        this.applyProfile(profile);
        this.persistToLocalStorage(profile);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.hydrateFromLocalStorage();
        this.saveError = err?.error?.message || '';
        this.cdr.detectChanges();
      }
    });
  }

  private fetchEventStats(): void {
    this.isStatsLoading = true;
    this.http.get<AdminEventSummary[]>(this.EVENTS_API, { headers: this.getAuthHeaders() }).subscribe({
      next: (events) => {
        const list = Array.isArray(events) ? events : [];
        this.totalEvents = list.length;
        this.activeEvents = list.filter((event) => String(event?.status || '').toLowerCase() !== 'past').length;
        this.totalRegistrations = list.reduce((sum, event) => sum + Number(event?.registrations || 0), 0);
        this.unlimitedEvents = list.filter((event) => !(typeof event?.maxAttendees === 'number' && event.maxAttendees > 0)).length;
        this.isStatsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isStatsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private applyProfile(profile: AdminProfileResponse | null | undefined): void {
    if (!profile) return;

    this.userName = profile.name || this.userName;
    this.userId = profile.userId || this.userId;
    this.email = profile.email || this.email;
    this.college = profile.college || this.college;
    this.role = this.formatRole(profile.role || this.role);
    this.phone = profile.phone || '';
    this.gender = profile.gender || '';
    this.dateOfBirth = profile.dateOfBirth || '';
    this.location = profile.location || '';
    this.currentState = profile.currentState || '';
    this.currentDistrict = profile.currentDistrict || '';
    this.currentCity = profile.currentCity || '';
    this.department = profile.department || '';
    this.departmentOther = profile.departmentOther || '';
    this.profileImageUrl = profile.profileImageUrl || null;
    this.joinedOn = this.formatDateLabel(profile.createdAt, 'Recently');
    this.lastUpdatedOn = this.formatDateLabel(profile.updatedAt, 'Not available');
    this.resetEditForm();
  }

  private persistToLocalStorage(profile: AdminProfileResponse | null | undefined): void {
    const existing = JSON.parse(localStorage.getItem('currentUser') || '{}');
    localStorage.setItem('currentUser', JSON.stringify({
      ...existing,
      name: profile?.name ?? this.userName,
      userId: profile?.userId ?? this.userId,
      email: profile?.email ?? this.email,
      college: profile?.college ?? this.college,
      role: profile?.role ?? existing.role,
      profileCompleted: profile?.profileCompleted ?? existing.profileCompleted,
      phone: profile?.phone ?? this.phone,
      gender: profile?.gender ?? this.gender,
      dateOfBirth: profile?.dateOfBirth ?? this.dateOfBirth,
      location: profile?.location ?? this.location,
      currentState: profile?.currentState ?? this.currentState,
      currentDistrict: profile?.currentDistrict ?? this.currentDistrict,
      currentCity: profile?.currentCity ?? this.currentCity,
      department: profile?.department ?? this.department,
      departmentOther: profile?.departmentOther ?? this.departmentOther,
      profileImageUrl: profile?.profileImageUrl ?? this.profileImageUrl
    }));
  }

  private hydrateFromLocalStorage(): void {
    const cached = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!cached || Object.keys(cached).length === 0) return;

    this.userName = cached.name || this.userName;
    this.userId = cached.userId || this.userId;
    this.email = cached.email || this.email;
    this.college = cached.college || this.college;
    this.role = this.formatRole(cached.role || this.role);
    this.phone = cached.phone || this.phone;
    this.gender = cached.gender || this.gender;
    this.dateOfBirth = cached.dateOfBirth || this.dateOfBirth;
    this.location = cached.location || this.location;
    this.currentState = cached.currentState || this.currentState;
    this.currentDistrict = cached.currentDistrict || this.currentDistrict;
    this.currentCity = cached.currentCity || this.currentCity;
    this.department = cached.department || this.department;
    this.departmentOther = cached.departmentOther || this.departmentOther;
    this.profileImageUrl = cached.profileImageUrl || this.profileImageUrl;
    this.resetEditForm();
  }

  private formatRole(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'college_admin') return 'College Admin';
    if (normalized === 'admin') return 'Admin';
    if (normalized === 'super_admin') return 'Super Admin';
    return normalized ? normalized.replace(/_/g, ' ') : 'College Admin';
  }

  private formatDateLabel(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private resetEditForm(): void {
    this.editForm = {
      phone: this.phone,
      dateOfBirth: this.dateOfBirth,
      gender: this.gender,
      location: this.location,
      currentState: this.currentState,
      currentDistrict: this.currentDistrict,
      currentCity: this.currentCity,
      department: this.department,
      departmentOther: this.departmentOther
    };
  }

  private getEmptyEditForm(): {
    phone: string;
    dateOfBirth: string;
    gender: string;
    location: string;
    currentState: string;
    currentDistrict: string;
    currentCity: string;
    department: string;
    departmentOther: string;
  } {
    return {
      phone: '',
      dateOfBirth: '',
      gender: '',
      location: '',
      currentState: '',
      currentDistrict: '',
      currentCity: '',
      department: '',
      departmentOther: ''
    };
  }

  private getEmptyPasswordForm(): {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  } {
    return {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }
}
