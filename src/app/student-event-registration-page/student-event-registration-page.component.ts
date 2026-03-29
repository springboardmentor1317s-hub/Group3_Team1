import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, catchError, forkJoin, of, switchMap, throwError, timeout } from 'rxjs';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentProfile,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';
import {
  DEPARTMENT_OPTIONS,
  DISTRICTS_BY_STATE,
  INDIA_STATES,
  PROGRAM_OPTIONS,
  SEMESTER_OPTIONS
} from '../student-profile-page/profile-form-options';

@Component({
  selector: 'app-student-event-registration-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent, StudentHeaderComponent],
  templateUrl: './student-event-registration-page.component.html',
  styleUrls: ['./student-event-registration-page.component.scss']
})
export class StudentEventRegistrationPageComponent implements OnInit {
  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';
  successPopupOpen = false;
  popupTitle = 'Registration Submitted';
  popupMessage = '';
  event: StudentEventCard | null = null;
  profile: StudentProfile | null = null;
  registration: StudentRegistrationRecord | null = null;
  confirmChecked = false;

  readonly stateOptions = INDIA_STATES;
  readonly programOptions = PROGRAM_OPTIONS;
  readonly departmentOptions = DEPARTMENT_OPTIONS;
  readonly semesterOptions = SEMESTER_OPTIONS;
  readonly genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];

  form = {
    name: '',
    email: '',
    college: '',
    phone: '',
    parentPhone: '',
    gender: '',
    dateOfBirth: '',
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

  private eventId = '';
  private submitRequestSubscription: Subscription | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly studentDashboardService: StudentDashboardService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.eventId = params.get('id') || '';
      if (!this.eventId) {
        this.loading = false;
        this.errorMessage = 'Event not found.';
        return;
      }

      const navState = history.state || {};
      if (navState?.event) {
        this.event = navState.event as StudentEventCard;
      }
      if (navState?.registration) {
        this.registration = navState.registration as StudentRegistrationRecord;
      }

      const cachedProfile = this.studentDashboardService.getCachedProfile();
      const cachedEvent = this.studentDashboardService.getCachedEvents().find((item) => item.id === this.eventId) || null;
      const cachedRegistration = this.studentDashboardService.getCachedRegistrations().find((item) => item.eventId === this.eventId) || null;

      if (!this.event && cachedEvent) {
        this.event = cachedEvent;
      }
      if (!this.registration && cachedRegistration) {
        this.registration = cachedRegistration;
      }
      if (cachedProfile) {
        this.profile = cachedProfile;
        this.syncForm(cachedProfile);
        this.loading = false;
      }

      this.loadPage();
    });
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get profilePhotoUrl(): string {
    return String(this.profile?.profileImageUrl || JSON.parse(localStorage.getItem('currentUser') || '{}')?.profileImageUrl || '').trim();
  }

  get currentDistrictOptions(): string[] {
    return DISTRICTS_BY_STATE[this.form.currentState] || [];
  }

  get permanentDistrictOptions(): string[] {
    return DISTRICTS_BY_STATE[this.form.permanentState] || [];
  }

  get isRejected(): boolean {
    return this.registration?.status === 'REJECTED';
  }

  get isPending(): boolean {
    return this.registration?.status === 'PENDING';
  }

  get isApproved(): boolean {
    return this.registration?.status === 'APPROVED';
  }

  get pageTitle(): string {
    if (!this.event) return 'Student Registration';
    return `${this.event.title} Registration`;
  }

  get submitLabel(): string {
    if (this.saving) return this.isRejected ? 'Resubmitting...' : 'Submitting...';
    return this.isRejected ? 'Resubmit To Admin' : 'Submit Registration';
  }

  get canEditForm(): boolean {
    return !this.isPending && !this.isApproved;
  }

  get canSubmit(): boolean {
    if (!this.event || this.saving || !this.canEditForm || !this.confirmChecked) {
      return false;
    }

    return this.studentDashboardService.isProfileComplete({
      ...this.profile,
      ...this.form,
      location: `${this.form.currentCity}, ${this.form.currentDistrict}, ${this.form.currentState}`
    });
  }

  goBack(): void {
    if (!this.event) {
      this.router.navigate(['/student-events']);
      return;
    }

    this.router.navigate(['/student-event', this.event.id]);
  }

  syncCurrentAddress(): void {
    if (!this.form.currentSameAsPermanent) {
      return;
    }

    this.form.currentState = this.form.permanentState;
    this.form.currentDistrict = this.form.permanentDistrict;
    this.form.currentCity = this.form.permanentCity;
    this.form.currentPincode = this.form.permanentPincode;
    this.form.currentAddressLine = this.form.permanentAddressLine;
  }

  onPermanentStateChange(): void {
    if (!this.permanentDistrictOptions.includes(this.form.permanentDistrict)) {
      this.form.permanentDistrict = '';
    }
    this.syncCurrentAddress();
  }

  onCurrentStateChange(): void {
    if (!this.currentDistrictOptions.includes(this.form.currentDistrict)) {
      this.form.currentDistrict = '';
    }
  }

  closeSuccessPopup(): void {
    this.successPopupOpen = false;
    if (this.event?.id) {
      this.router.navigate(['/student-event', this.event.id], {
        queryParams: { registrationUpdated: '1' }
      });
    }
  }

  submitRegistration(): void {
    if (!this.canSubmit || !this.event) {
      this.errorMessage = 'Please review and complete all required profile details before submitting.';
      return;
    }

    const wasRejected = this.registration?.status === 'REJECTED';
    const previousRegistration = this.registration ? { ...this.registration } : null;
    const optimisticProfile = this.buildOptimisticProfile();
    const optimisticRegistration = this.buildOptimisticPendingRegistration();
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.successPopupOpen = false;

    this.profile = optimisticProfile;
    this.studentDashboardService.applyProfileUpdate(optimisticProfile);

    this.studentDashboardService.updateMyProfile(this.buildProfilePayload()).pipe(
      timeout(5000),
      catchError(() => of(optimisticProfile))
    ).subscribe({
      next: (updatedProfile) => {
        this.profile = updatedProfile;
        this.studentDashboardService.applyProfileUpdate(updatedProfile);
      },
      error: () => void 0
    });

    if (this.event) {
      this.studentDashboardService.applyRegistrationUpdate(optimisticRegistration, this.event);
    }

    this.completeSubmissionUI(optimisticRegistration, wasRejected);

    this.submitRequestSubscription?.unsubscribe();
    this.submitRequestSubscription = this.studentDashboardService.registerForEvent(this.event!.id).pipe(
      timeout(5000),
      catchError((error) => this.resolveRegistrationAfterSubmitError(error))
    ).subscribe({
      next: (registration) => {
        this.saving = false;
        this.completeSubmissionUI(registration, wasRejected);
      },
      error: (error) => {
        this.saving = false;
        this.successPopupOpen = false;
        this.successMessage = '';
        this.registration = previousRegistration;
        if (previousRegistration && this.event) {
          this.studentDashboardService.applyRegistrationUpdate(previousRegistration, this.event);
        }
        this.studentDashboardService.refreshDashboardSnapshot().subscribe({
          next: () => void 0,
          error: () => void 0
        });
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to submit registration right now.';
      }
    });
  }

  private completeSubmissionUI(registration: StudentRegistrationRecord, wasRejected: boolean): void {
    this.registration = {
      ...registration,
      status: 'PENDING',
      rejectionReason: '',
      approvedAt: null,
      rejectedAt: null
    };
    this.confirmChecked = false;
    this.successMessage = wasRejected
      ? 'Your application was resubmitted and is now pending admin review.'
      : 'Your application was submitted and is now pending admin review.';
    this.popupTitle = wasRejected ? 'Application Resubmitted' : 'Application Submitted';
    this.popupMessage = wasRejected
      ? 'Your updated application has been submitted to the admin again. Current status: Pending review.'
      : 'Your application has been submitted to the admin successfully. Current status: Pending review.';
    this.successPopupOpen = true;
    if (this.event) {
      this.studentDashboardService.applyRegistrationUpdate(this.registration, this.event);
    }

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: () => void 0,
      error: () => void 0
    });
  }

  private buildOptimisticPendingRegistration(): StudentRegistrationRecord {
    const existing = this.registration;
    const now = new Date().toISOString();

    return {
      id: String(existing?.id || `optimistic-${this.eventId}`),
      eventId: this.eventId,
      eventName: String(this.event?.title || existing?.eventName || 'Event'),
      studentId: String(existing?.studentId || this.profile?.id || ''),
      studentName: this.form.name.trim(),
      email: this.form.email.trim(),
      college: this.form.college.trim(),
      status: 'PENDING',
      rejectionReason: '',
      approvedAt: null,
      rejectedAt: null,
      createdAt: String(existing?.createdAt || now),
      updatedAt: now,
      event: existing?.event || (this.event ? {
        id: this.event.id,
        name: this.event.title,
        dateTime: this.event.dateTime,
        location: this.event.location,
        organizer: this.event.organizer,
        contact: this.event.contact,
        description: this.event.description,
        category: this.event.category,
        posterDataUrl: this.event.imageUrl,
        status: this.event.status,
        registrations: this.event.registrations,
        maxAttendees: this.event.maxAttendees ?? null,
        dateLabel: this.event.dateLabel
      } : null)
    };
  }

  private buildOptimisticProfile(): StudentProfile {
    const existing = this.profile;
    const now = new Date().toISOString();

    return {
      id: String(existing?.id || ''),
      name: this.form.name.trim(),
      userId: String(existing?.userId || ''),
      email: this.form.email.trim(),
      role: String(existing?.role || 'student'),
      profileCompleted: true,
      college: this.form.college.trim(),
      phone: this.form.phone.trim(),
      parentPhone: this.form.parentPhone.trim(),
      gender: this.form.gender.trim(),
      dateOfBirth: this.form.dateOfBirth,
      location: String(existing?.location || ''),
      department: this.form.department,
      departmentOther: this.form.departmentOther.trim(),
      currentClass: this.form.currentClass,
      semester: this.form.semester,
      currentCgpa: this.form.currentCgpa.trim(),
      currentState: this.form.currentState,
      currentDistrict: this.form.currentDistrict,
      currentCity: this.form.currentCity.trim(),
      currentPincode: this.form.currentPincode.trim(),
      currentAddressLine: this.form.currentAddressLine.trim(),
      permanentState: this.form.permanentState,
      permanentDistrict: this.form.permanentDistrict,
      permanentCity: this.form.permanentCity.trim(),
      permanentPincode: this.form.permanentPincode.trim(),
      permanentAddressLine: this.form.permanentAddressLine.trim(),
      profileImageUrl: String(existing?.profileImageUrl || ''),
      createdAt: String(existing?.createdAt || now),
      updatedAt: now
    };
  }

  private resolveRegistrationAfterSubmitError(error: any) {
    const fallbackRegistration = error?.error?.registration
      ? {
          ...error.error.registration,
          status: String(error.error.registration.status || 'PENDING').toUpperCase()
        } as StudentRegistrationRecord
      : null;

    return this.studentDashboardService.fetchLatestRegistrations().pipe(
      timeout(5000),
      switchMap((registrations) => {
        const latest = (registrations || []).find((item) => item.eventId === this.eventId) || fallbackRegistration;
        if (latest && (latest.status === 'PENDING' || latest.status === 'APPROVED')) {
          return of(latest);
        }

        if (fallbackRegistration && fallbackRegistration.status === 'PENDING') {
          return of(fallbackRegistration);
        }

        return throwError(() => error);
      }),
      catchError(() => {
        if (fallbackRegistration && fallbackRegistration.status === 'PENDING') {
          return of(fallbackRegistration);
        }

        return throwError(() => error);
      })
    );
  }

  private loadPage(): void {
    if (!this.profile) {
      this.loading = true;
    }
    this.errorMessage = '';
    this.successMessage = '';

    forkJoin({
      profile: this.studentDashboardService.getMyProfileDetails().pipe(
        timeout(12000),
        catchError(() => of(this.studentDashboardService.getCachedProfile()))
      ),
      events: this.studentDashboardService.getEvents().pipe(
        timeout(12000),
        catchError(() => of(this.studentDashboardService.getCachedEvents()))
      ),
      registrations: this.studentDashboardService.fetchLatestRegistrations().pipe(
        timeout(12000),
        catchError(() => of(this.studentDashboardService.getCachedRegistrations()))
      )
    }).subscribe({
      next: ({ profile, events, registrations }) => {
        if (profile) {
          this.profile = profile;
          this.syncForm(profile);
        }
        this.event = (events || []).find((item) => item.id === this.eventId) || this.event || null;
        this.registration = (registrations || []).find((item) => item.eventId === this.eventId) || this.registration || null;
        this.loading = false;

        if (!this.event) {
          this.errorMessage = 'Event not found.';
        }
      },
      error: () => {
        this.loading = false;
        if (!this.profile) {
          this.errorMessage = 'Unable to load the registration form right now.';
        }
      }
    });
  }

  private syncForm(profile: StudentProfile): void {
    this.form = {
      name: profile.name || '',
      email: profile.email || '',
      college: profile.college || '',
      phone: profile.phone || '',
      parentPhone: profile.parentPhone || '',
      gender: profile.gender || '',
      dateOfBirth: profile.dateOfBirth || '',
      department: profile.department || '',
      departmentOther: profile.departmentOther || '',
      currentClass: profile.currentClass || '',
      semester: profile.semester || '',
      currentCgpa: profile.currentCgpa || '',
      currentState: profile.currentState || '',
      currentDistrict: profile.currentDistrict || '',
      currentCity: profile.currentCity || '',
      currentPincode: profile.currentPincode || '',
      currentAddressLine: profile.currentAddressLine || '',
      permanentState: profile.permanentState || '',
      permanentDistrict: profile.permanentDistrict || '',
      permanentCity: profile.permanentCity || '',
      permanentPincode: profile.permanentPincode || '',
      permanentAddressLine: profile.permanentAddressLine || '',
      currentSameAsPermanent: false
    };
  }

  private buildProfilePayload(): {
    name: string;
    email: string;
    college: string;
    phone: string;
    parentPhone: string;
    gender: string;
    dateOfBirth: string;
    location: string;
    department: string;
    departmentOther: string;
    currentClass: string;
    semester: string;
    currentCgpa: string;
    currentState: string;
    currentDistrict: string;
    currentCity: string;
    currentPincode: string;
    currentAddressLine: string;
    permanentState: string;
    permanentDistrict: string;
    permanentCity: string;
    permanentPincode: string;
    permanentAddressLine: string;
    profileImageUrl?: string;
  } {
    const location = [this.form.currentCity, this.form.currentDistrict, this.form.currentState]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');

    return {
      name: this.form.name,
      email: this.form.email,
      college: this.form.college,
      phone: this.form.phone,
      parentPhone: this.form.parentPhone,
      gender: this.form.gender,
      dateOfBirth: this.form.dateOfBirth,
      location,
      department: this.form.department,
      departmentOther: this.form.departmentOther,
      currentClass: this.form.currentClass,
      semester: this.form.semester,
      currentCgpa: this.form.currentCgpa,
      currentState: this.form.currentState,
      currentDistrict: this.form.currentDistrict,
      currentCity: this.form.currentCity,
      currentPincode: this.form.currentPincode,
      currentAddressLine: this.form.currentAddressLine,
      permanentState: this.form.permanentState,
      permanentDistrict: this.form.permanentDistrict,
      permanentCity: this.form.permanentCity,
      permanentPincode: this.form.permanentPincode,
      permanentAddressLine: this.form.permanentAddressLine,
      profileImageUrl: this.profile?.profileImageUrl
    };
  }
}
