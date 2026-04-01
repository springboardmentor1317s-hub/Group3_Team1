import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, catchError, finalize, forkJoin, map, of, switchMap, throwError, timeout } from 'rxjs';
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
import { PaymentService, PaymentStatus } from '../services/payment.service';

@Component({
  selector: 'app-student-event-registration-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, StudentHeaderComponent],
  templateUrl: './student-event-registration-page.component.html',
  styleUrls: ['./student-event-registration-page.component.scss']
})
export class StudentEventRegistrationPageComponent implements OnInit, OnDestroy {
  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';
  successPopupOpen = false;
  popupTitle = 'Registration Submitted';
  popupMessage = '';
  popupRedirectUrl = '';
  popupRedirectState: Record<string, unknown> | null = null;
  event: StudentEventCard | null = null;
  profile: StudentProfile | null = null;
  registration: StudentRegistrationRecord | null = null;
  confirmChecked = false;
  paymentProcessing = false;
  latestPaymentStatus: PaymentStatus | null = null;

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
    private readonly studentDashboardService: StudentDashboardService,
    private readonly cdr: ChangeDetectorRef,
    private readonly paymentService: PaymentService
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

  ngOnDestroy(): void {
    this.submitRequestSubscription?.unsubscribe();
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
    if (this.paymentProcessing) return 'Opening Payment...';
    if (this.saving) return this.isRejected ? 'Resubmitting...' : 'Submitting...';
    if (this.isPaidEvent) return 'Proceed To Pay';
    return this.isRejected ? 'Resubmit To Admin' : 'Submit Registration';
  }

  get canEditForm(): boolean {
    return !this.isPending && !this.isApproved;
  }

  get canSubmit(): boolean {
    if (!this.event || this.saving || this.paymentProcessing || !this.canEditForm || !this.confirmChecked) {
      return false;
    }

    return true;
  }

  get isPaidEvent(): boolean {
    return Boolean(this.event?.isPaid) && Number(this.event?.amount || 0) > 0;
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
    if (this.popupRedirectUrl) {
      const redirectUrl = this.popupRedirectUrl;
      const redirectState = this.popupRedirectState || undefined;
      this.popupRedirectUrl = '';
      this.popupRedirectState = null;
      this.router.navigate([redirectUrl], { state: redirectState });
      return;
    }
    if (this.event?.id) {
      this.router.navigate(['/student-event', this.event.id], {
        queryParams: { registrationUpdated: '1' }
      });
    }
  }

  submitRegistration(): void {
    if (this.saving) {
      return;
    }

    if (!this.canSubmit || !this.event) {
      this.errorMessage = 'Please review and complete all required profile details before submitting.';
      return;
    }

    const wasRejected = this.registration?.status === 'REJECTED';
    const previousRegistration = this.registration ? { ...this.registration } : null;
    const optimisticProfile = this.buildOptimisticProfile();
    const optimisticRegistration = this.buildOptimisticPendingRegistration();
    this.setSaving(true);
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

    if (this.isPaidEvent) {
      this.launchPaidRegistrationFlow(wasRejected, previousRegistration);
      return;
    }

    const submitRequest$ = wasRejected
      ? this.studentDashboardService.resubmitRegistration(this.event.id).pipe(
          timeout(10000),
          catchError((error) => {
            const message = String(error?.error?.error || error?.error?.message || '').toLowerCase();
            if (message.includes('already approved')) return throwError(() => error);
            // Fallback for stale data / older backend where resubmit route is unavailable.
            return this.studentDashboardService.registerForEvent(this.event!.id);
          })
        )
      : this.studentDashboardService.registerForEvent(this.event.id);

    this.submitRequestSubscription?.unsubscribe();
    this.submitRequestSubscription = submitRequest$.pipe(
      timeout(12000),
      catchError((error) => this.resolveSubmissionFromLatestState(error)),
      finalize(() => {
        this.setSaving(false);
      })
    ).subscribe({
      next: (registration) => {
        const nextRegistration = (registration as StudentRegistrationRecord | null) || optimisticRegistration;
        this.completeSubmissionUI(nextRegistration, wasRejected);
      },
      error: (error) => {
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

  private launchPaidRegistrationFlow(wasRejected: boolean, previousRegistration: StudentRegistrationRecord | null): void {
    if (!this.event) {
      this.setSaving(false);
      return;
    }

    this.paymentProcessing = true;
    this.submitRequestSubscription?.unsubscribe();
    this.submitRequestSubscription = this.paymentService.openCheckout({
      eventId: this.event.id,
      eventName: this.event.title,
      amount: Number(this.event.amount || 0),
      studentName: this.form.name.trim(),
      studentEmail: this.form.email.trim(),
      contact: this.form.phone.trim()
    }).pipe(
      switchMap((checkout) => {
        if (checkout.signature) {
          return this.paymentService.verifyPayment({
            eventId: this.event!.id,
            orderId: checkout.orderId,
            paymentId: checkout.paymentId,
            signature: checkout.signature
          }).pipe(
            switchMap((verifyResponse) => this.paymentService.savePayment({
              eventId: this.event!.id,
              orderId: checkout.orderId,
              paymentId: checkout.paymentId
            }).pipe(
              map(() => verifyResponse.payment)
            ))
          );
        }

        return this.paymentService.getPaymentStatus(this.event!.id).pipe(
          map((status) => {
            if (!status.verified) {
              throw new Error('Payment verification is still pending.');
            }
            return status;
          })
        );
      }),
      switchMap((payment) => {
        this.latestPaymentStatus = payment;
        const submitRequest$ = wasRejected
          ? this.studentDashboardService.resubmitRegistration(this.event!.id)
          : this.studentDashboardService.registerForEvent(this.event!.id);

        return submitRequest$.pipe(map((registration) => ({ registration, payment })));
      }),
      finalize(() => {
        this.paymentProcessing = false;
        this.setSaving(false);
      })
    ).subscribe({
      next: ({ registration, payment }) => {
        this.latestPaymentStatus = payment;
        this.completeSubmissionUI(registration, wasRejected);
        this.popupTitle = 'Payment Successful';
        this.popupMessage = 'Your payment was verified and your registration was sent for admin review.';
        this.popupRedirectUrl = '/student-payment-success';
        this.popupRedirectState = {
          event: this.event,
          registration,
          payment
        };
        this.successPopupOpen = true;
      },
      error: (error) => {
        this.successMessage = '';
        this.registration = previousRegistration;
        if (previousRegistration && this.event) {
          this.studentDashboardService.applyRegistrationUpdate(previousRegistration, this.event);
        }
        this.studentDashboardService.refreshDashboardSnapshot().subscribe({
          next: () => void 0,
          error: () => void 0
        });
        this.errorMessage = error?.error?.error || error?.error?.message || error?.message || 'Payment failed. Please try again after some time.';
        this.popupTitle = 'Payment Failed';
        this.popupMessage = this.errorMessage;
        this.popupRedirectUrl = '/student-payment-failure';
        this.popupRedirectState = {
          event: this.event,
          message: this.errorMessage
        };
        this.successPopupOpen = true;
      }
    });
  }

  private resolveSubmissionFromLatestState(error: any) {
    const backendMessage = String(error?.error?.error || error?.error?.message || '').toLowerCase();
    const shouldTreatAsPending = backendMessage.includes('already pending')
      || backendMessage.includes('already approved')
      || backendMessage.includes('duplicate');

    if (shouldTreatAsPending) {
      return of(this.buildOptimisticPendingRegistration());
    }

    return this.studentDashboardService.fetchLatestRegistrations().pipe(
      timeout(7000),
      map((registrations) => (registrations || []).find((item) => item.eventId === this.eventId) || null),
      switchMap((latestRegistration) => {
        if (latestRegistration && (latestRegistration.status === 'PENDING' || latestRegistration.status === 'APPROVED')) {
          return of(latestRegistration);
        }
        return throwError(() => error);
      }),
      catchError(() => throwError(() => error))
    );
  }

  private setSaving(value: boolean): void {
    this.saving = value;
    this.cdr.markForCheck();
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
