import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { Auth } from '../auth/auth';
import {
  DEPARTMENT_OPTIONS,
  DISTRICTS_BY_STATE,
  INDIA_STATES,
  PROGRAM_OPTIONS,
  SEMESTER_OPTIONS
} from './profile-form-options';
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
  successMessage = '';
  profileUpdateRequired = false;
  private redirectAfterProfileUpdate = '/new-student-dashboard';
  readonly indiaCountry = 'India';
  readonly stateOptions = INDIA_STATES;
  readonly programOptions = PROGRAM_OPTIONS;
  readonly departmentOptions = DEPARTMENT_OPTIONS;
  readonly semesterOptions = SEMESTER_OPTIONS;
  readonly genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];
  selectedProfileImage: string | null = null;
  editForm = {
    name: '',
    email: '',
    college: '',
    phone: '',
    parentPhone: '',
    gender: '',
    dateOfBirth: '',
    location: '',
    department: '',
    departmentOther: '',
    currentClass: '',
    semester: '',
    currentCgpa: '',
    currentState: '',
    currentDistrict: '',
    currentCity: '',
    currentPincode: '',
    currentAddressLine: '',
    permanentState: '',
    permanentDistrict: '',
    permanentCity: '',
    permanentPincode: '',
    permanentAddressLine: '',
    currentSameAsPermanent: false
  };
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  photoUploadInProgress = false;
  photoUploadFeedbackActive = false;
  private previewObjectUrl: string | null = null;
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private photoUploadFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private successMessageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.profileUpdateRequired = params.get('requireProfileUpdate') === '1';
      this.redirectAfterProfileUpdate = params.get('redirectTo') || '/new-student-dashboard';
    });
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

    if (this.photoUploadFeedbackTimer) {
      clearTimeout(this.photoUploadFeedbackTimer);
      this.photoUploadFeedbackTimer = null;
    }

    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
      this.successMessageTimer = null;
    }

    this.clearPreviewObjectUrl();
  }

  get approvedCount(): number {
    return this.registrations.filter((item) => item.status === 'APPROVED').length;
  }

  get pendingCount(): number {
    return this.registrations.filter((item) => item.status === 'PENDING').length;
  }

  get timelineRegistrations(): StudentRegistrationRecord[] {
    return [...this.registrations].sort(
      (a, b) => this.getRegistrationActivityTimestamp(b) - this.getRegistrationActivityTimestamp(a)
    );
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get profilePhotoUrl(): string {
    if (this.selectedProfileImage) return this.selectedProfileImage;
    if (this.profile?.profileImageUrl) return this.profile.profileImageUrl;

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(
      currentUser.profileImageUrl
      || currentUser.profilePhotoUrl
      || currentUser.avatarUrl
      || currentUser.photoUrl
      || ''
    ).trim();
  }

  get profileInitials(): string {
    const parts = String(this.profile?.name || this.studentName || 'Student')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return 'ST';
    }

    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  get currentDistrictOptions(): string[] {
    return DISTRICTS_BY_STATE[this.editForm.currentState] || [];
  }

  get permanentDistrictOptions(): string[] {
    return DISTRICTS_BY_STATE[this.editForm.permanentState] || [];
  }

  get currentAddressPreview(): string {
    return this.formatAddress({
      state: this.profile?.currentState,
      district: this.profile?.currentDistrict,
      city: this.profile?.currentCity,
      pincode: this.profile?.currentPincode,
      line: this.profile?.currentAddressLine
    });
  }

  get permanentAddressPreview(): string {
    return this.formatAddress({
      state: this.profile?.permanentState,
      district: this.profile?.permanentDistrict,
      city: this.profile?.permanentCity,
      pincode: this.profile?.permanentPincode,
      line: this.profile?.permanentAddressLine
    });
  }

  get resolvedDepartmentLabel(): string {
    const department = String(this.profile?.department || '').trim();
    const departmentOther = String(this.profile?.departmentOther || '').trim();
    if (department === 'Other' && departmentOther) {
      return departmentOther;
    }

    return department || 'Not added yet';
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
        this.profileUpdateRequired = this.profileUpdateRequired || !this.studentDashboardService.isProfileComplete(this.profile);
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
      this.router.navigate(['/student-feedback']);
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

  trackByRegistration(_index: number, registration: StudentRegistrationRecord): string {
    return registration.id;
  }

  startEdit(): void {
    if (!this.profile) return;
    this.isEditing = true;
    this.editError = '';
    this.syncEditForm(this.profile);
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editError = '';
    if (this.profile) {
      this.syncEditForm(this.profile);
    }
  }

  saveProfile(): void {
    if (!this.profile || this.isSaving) return;

    const nextName = this.editForm.name.trim();
    const nextCollege = this.editForm.college.trim();
    const nextPhone = this.editForm.phone.trim();
    const nextParentPhone = this.editForm.parentPhone.trim();
    const nextGender = this.editForm.gender.trim();
    const nextDateOfBirth = this.editForm.dateOfBirth.trim();
    const nextDepartment = this.editForm.department.trim();
    const nextDepartmentOther = this.editForm.departmentOther.trim();
    const nextCurrentClass = this.editForm.currentClass.trim();
    const nextSemester = this.editForm.semester.trim();
    const nextCurrentCgpa = this.editForm.currentCgpa.trim();
    const nextCurrentState = this.editForm.currentState.trim();
    const nextCurrentDistrict = this.editForm.currentDistrict.trim();
    const nextCurrentCity = this.editForm.currentCity.trim();
    const nextCurrentPincode = this.editForm.currentPincode.trim();
    const nextCurrentAddressLine = this.editForm.currentAddressLine.trim();
    const nextPermanentState = this.editForm.permanentState.trim();
    const nextPermanentDistrict = this.editForm.permanentDistrict.trim();
    const nextPermanentCity = this.editForm.permanentCity.trim();
    const nextPermanentPincode = this.editForm.permanentPincode.trim();
    const nextPermanentAddressLine = this.editForm.permanentAddressLine.trim();

    const payload = {
      name: nextName,
      college: nextCollege,
      phone: nextPhone,
      parentPhone: nextParentPhone,
      gender: nextGender,
      dateOfBirth: nextDateOfBirth,
      department: nextDepartment,
      departmentOther: nextDepartment === 'Other' ? nextDepartmentOther : '',
      currentClass: nextCurrentClass,
      semester: nextSemester,
      currentCgpa: nextCurrentCgpa,
      currentState: nextCurrentState,
      currentDistrict: nextCurrentDistrict,
      currentCity: nextCurrentCity,
      currentPincode: nextCurrentPincode,
      currentAddressLine: nextCurrentAddressLine,
      permanentState: nextPermanentState,
      permanentDistrict: nextPermanentDistrict,
      permanentCity: nextPermanentCity,
      permanentPincode: nextPermanentPincode,
      permanentAddressLine: nextPermanentAddressLine
    };

    if (!payload.name) {
      this.editError = 'Full name is required.';
      return;
    }

    if (payload.department === 'Other' && !payload.departmentOther) {
      this.editError = 'Please enter your department name in Other.';
      return;
    }

    if ((payload.phone && !/^\d{10}$/.test(payload.phone))
      || (payload.parentPhone && !/^\d{10}$/.test(payload.parentPhone))) {
      this.editError = 'Phone numbers must be valid 10 digit Indian mobile numbers.';
      return;
    }

    if (payload.currentCgpa && !/^(?:10(?:\.0{1,2})?|[0-9](?:\.\d{1,2})?)$/.test(payload.currentCgpa)) {
      this.editError = 'Current CGPA must be between 0 and 10.';
      return;
    }

    if ((payload.currentPincode && !/^\d{6}$/.test(payload.currentPincode))
      || (payload.permanentPincode && !/^\d{6}$/.test(payload.permanentPincode))) {
      this.editError = 'Pincode must be a valid 6 digit Indian PIN code.';
      return;
    }

    const previousProfile: StudentProfile = { ...this.profile };
    const optimisticProfile: StudentProfile = {
      ...this.profile,
      name: nextName,
      college: nextCollege,
      phone: nextPhone,
      parentPhone: nextParentPhone,
      gender: nextGender,
      dateOfBirth: nextDateOfBirth,
      department: nextDepartment,
      departmentOther: nextDepartment === 'Other' ? nextDepartmentOther : '',
      currentClass: nextCurrentClass,
      semester: nextSemester,
      currentCgpa: nextCurrentCgpa,
      currentState: nextCurrentState,
      currentDistrict: nextCurrentDistrict,
      currentCity: nextCurrentCity,
      currentPincode: nextCurrentPincode,
      currentAddressLine: nextCurrentAddressLine,
      permanentState: nextPermanentState,
      permanentDistrict: nextPermanentDistrict,
      permanentCity: nextPermanentCity,
      permanentPincode: nextPermanentPincode,
      permanentAddressLine: nextPermanentAddressLine,
      updatedAt: new Date().toISOString()
    };

    this.isSaving = true;
    this.editError = '';
    this.profile = optimisticProfile;
    this.profile.profileCompleted = this.studentDashboardService.isProfileComplete(optimisticProfile);
    this.isEditing = false;
    this.syncEditForm(optimisticProfile);
    this.persistCurrentUser(optimisticProfile);
    this.showSuccessMessage('Your profile is updated.');

    this.studentDashboardService.updateMyProfile(payload).subscribe({
      next: (updated) => {
        this.profile = {
          ...optimisticProfile,
          ...updated
        };
        this.profile.profileCompleted = this.studentDashboardService.isProfileComplete(this.profile);
        this.isSaving = false;
        this.profileUpdateRequired = !this.profile.profileCompleted;
        this.syncEditForm(this.profile);
        this.persistCurrentUser(this.profile);
        if (!this.profileUpdateRequired) {
          this.router.navigateByUrl(this.redirectAfterProfileUpdate);
        }
      },
      error: (error) => {
        this.profile = previousProfile;
        this.isSaving = false;
        this.isEditing = true;
        this.syncEditForm(previousProfile);
        this.persistCurrentUser(previousProfile);
        this.clearSuccessMessage();
        this.editError = error?.error?.message || 'Unable to save profile right now.';
      }
    });
  }

  startForcedProfileUpdate(): void {
    this.startEdit();
  }

  onPermanentStateChange(): void {
    if (!this.permanentDistrictOptions.includes(this.editForm.permanentDistrict)) {
      this.editForm.permanentDistrict = '';
    }

    if (this.editForm.currentSameAsPermanent) {
      this.copyPermanentAddressToCurrent();
    }
  }

  onCurrentStateChange(): void {
    if (!this.currentDistrictOptions.includes(this.editForm.currentDistrict)) {
      this.editForm.currentDistrict = '';
    }
  }

  onDepartmentChange(): void {
    if (this.editForm.department !== 'Other') {
      this.editForm.departmentOther = '';
    }
  }

  onPermanentAddressInput(): void {
    if (this.editForm.currentSameAsPermanent) {
      this.copyPermanentAddressToCurrent();
    }
  }

  onSameAsPermanentToggle(): void {
    if (this.editForm.currentSameAsPermanent) {
      this.copyPermanentAddressToCurrent();
      return;
    }

    this.editForm.currentState = '';
    this.editForm.currentDistrict = '';
    this.editForm.currentCity = '';
    this.editForm.currentPincode = '';
    this.editForm.currentAddressLine = '';
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

    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.editError = 'Please choose an image smaller than 5MB.';
      input.value = '';
      return;
    }

    if (!this.profile) {
      this.editError = 'Profile is not ready yet. Please try again.';
      input.value = '';
      return;
    }

    const previousImage = this.profile.profileImageUrl || this.selectedProfileImage || null;
    this.setPreviewObjectUrl(file);
    this.editError = '';
    this.photoUploadInProgress = true;
    this.startPhotoUploadFeedback();

    this.compressImageFile(file).then((nextImage) => {
      const optimisticProfile: StudentProfile = {
        ...this.profile!,
        profileImageUrl: nextImage
      };

      this.profile = optimisticProfile;
      this.selectedProfileImage = nextImage;
      this.studentDashboardService.applyProfileUpdate(optimisticProfile);

      this.studentDashboardService.updateMyProfile({ profileImageUrl: nextImage }).pipe(
        timeout(5000),
        finalize(() => {
          this.photoUploadInProgress = false;
          input.value = '';
        })
      ).subscribe({
        next: (updated) => {
          this.profile = {
            ...this.profile!,
            ...updated
          };
          this.selectedProfileImage = this.profile.profileImageUrl || null;
          this.studentDashboardService.applyProfileUpdate(this.profile);
          this.clearPreviewObjectUrl();
        },
        error: (error) => {
          this.profile = {
            ...this.profile!,
            profileImageUrl: previousImage || ''
          };
          this.selectedProfileImage = previousImage;
          this.clearPreviewObjectUrl();
          this.studentDashboardService.applyProfileUpdate(this.profile);
          this.editError = error?.name === 'TimeoutError'
            ? 'Photo save is taking too long. Please try once again.'
            : error?.error?.message || 'Unable to upload profile photo right now.';
        }
      });
    }).catch(() => {
      this.selectedProfileImage = previousImage;
      this.photoUploadInProgress = false;
      this.clearPhotoUploadFeedback();
      this.clearPreviewObjectUrl();
      this.editError = 'Could not process image file.';
      input.value = '';
    });
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
      this.profileUpdateRequired = this.profileUpdateRequired || !this.studentDashboardService.isProfileComplete(this.profile);
    }
  }

  private syncEditForm(profile: StudentProfile): void {
    this.editForm = {
      name: String(profile?.name || ''),
      email: String(profile?.email || ''),
      college: String(profile?.college || ''),
      phone: String(profile?.phone || ''),
      parentPhone: String(profile?.parentPhone || ''),
      gender: String(profile?.gender || ''),
      dateOfBirth: String(profile?.dateOfBirth || ''),
      location: String(profile?.location || ''),
      department: String(profile?.department || ''),
      departmentOther: String(profile?.departmentOther || ''),
      currentClass: String(profile?.currentClass || ''),
      semester: String(profile?.semester || ''),
      currentCgpa: String(profile?.currentCgpa || ''),
      currentState: String(profile?.currentState || ''),
      currentDistrict: String(profile?.currentDistrict || ''),
      currentCity: String(profile?.currentCity || ''),
      currentPincode: String(profile?.currentPincode || ''),
      currentAddressLine: String(profile?.currentAddressLine || ''),
      permanentState: String(profile?.permanentState || ''),
      permanentDistrict: String(profile?.permanentDistrict || ''),
      permanentCity: String(profile?.permanentCity || ''),
      permanentPincode: String(profile?.permanentPincode || ''),
      permanentAddressLine: String(profile?.permanentAddressLine || ''),
      currentSameAsPermanent: false
    };
    this.selectedProfileImage = profile?.profileImageUrl || null;
  }

  private persistCurrentUser(profile: StudentProfile): void {
    this.studentDashboardService.applyProfileUpdate(profile);
  }

  private setPreviewObjectUrl(file: File): void {
    this.clearPreviewObjectUrl();
    this.previewObjectUrl = URL.createObjectURL(file);
    this.selectedProfileImage = this.previewObjectUrl;
  }

  private clearPreviewObjectUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  private startPhotoUploadFeedback(): void {
    this.clearPhotoUploadFeedback();
    this.photoUploadFeedbackActive = true;
    this.photoUploadFeedbackTimer = setTimeout(() => {
      this.photoUploadFeedbackActive = false;
      this.photoUploadFeedbackTimer = null;
    }, 700);
  }

  private clearPhotoUploadFeedback(): void {
    this.photoUploadFeedbackActive = false;
    if (this.photoUploadFeedbackTimer) {
      clearTimeout(this.photoUploadFeedbackTimer);
      this.photoUploadFeedbackTimer = null;
    }
  }

  private compressImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const maxSize = 320;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas is not supported'));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);

        const fallbackDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const toBlobCallback = (blob: Blob | null) => {
          if (!blob) {
            resolve(fallbackDataUrl);
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : fallbackDataUrl;
            resolve(result);
          };
          reader.onerror = () => resolve(fallbackDataUrl);
          reader.readAsDataURL(blob);
        };

        canvas.toBlob(toBlobCallback, 'image/jpeg', 0.82);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load failed'));
      };

      image.src = objectUrl;
    });
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

  private showSuccessMessage(message: string): void {
    this.successMessage = message;
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
    }
    this.successMessageTimer = setTimeout(() => {
      this.successMessage = '';
      this.successMessageTimer = null;
    }, 2200);
  }

  private clearSuccessMessage(): void {
    this.successMessage = '';
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
      this.successMessageTimer = null;
    }
  }

  private copyPermanentAddressToCurrent(): void {
    this.editForm.currentState = this.editForm.permanentState;
    this.editForm.currentDistrict = this.editForm.permanentDistrict;
    this.editForm.currentCity = this.editForm.permanentCity;
    this.editForm.currentPincode = this.editForm.permanentPincode;
    this.editForm.currentAddressLine = this.editForm.permanentAddressLine;
  }

  private formatAddress(address: {
    state?: string;
    district?: string;
    city?: string;
    pincode?: string;
    line?: string;
  }): string {
    const parts = [
      String(address.line || '').trim(),
      String(address.city || '').trim(),
      String(address.district || '').trim(),
      String(address.state || '').trim(),
      String(address.pincode || '').trim(),
      this.indiaCountry
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : 'Not added yet';
  }

  private getRegistrationActivityTimestamp(registration: StudentRegistrationRecord): number {
    const activityDate =
      registration.approvedAt ||
      registration.rejectedAt ||
      registration.updatedAt ||
      registration.createdAt ||
      registration.event?.dateTime ||
      '';

    const timestamp = new Date(activityDate).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
}
