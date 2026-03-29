import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { EventService } from '../services/event.service';
import { AuthService } from '../services/auth.service';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { FormsModule } from '@angular/forms';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { Auth } from '../auth/auth';

interface Registration {
  id: string;
  studentName: string;
  studentId: string;
  email: string;
  college: string;
  eventName: string;
  eventId: string;
  createdAt: string;
  updatedAt?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewProfile?: ReviewProfile | null;
}

interface ReviewProfile {
  id: string;
  name: string;
  userId: string;
  email: string;
  role: string;
  college: string;
  gender?: string;
  dateOfBirth?: string;
  phone?: string;
  location?: string;
  parentPhone?: string;
  department?: string;
  departmentOther?: string;
  currentClass?: string;
  semester?: string;
  currentCgpa?: string;
  currentState?: string;
  currentDistrict?: string;
  currentCity?: string;
  currentPincode?: string;
  currentAddressLine?: string;
  permanentState?: string;
  permanentDistrict?: string;
  permanentCity?: string;
  permanentPincode?: string;
  permanentAddressLine?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RegistrationReviewResponse {
  registration: Registration;
  profile: ReviewProfile;
}

interface RegistrationDetailsGroup {
  eventId: string;
  eventName: string;
  total: number;
  statusLabel: 'Open' | 'Closed';
  registrations: Registration[];
}

@Component({
  selector: 'app-admin-registration-details',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminDashboardSidebarComponent, AdminCommonHeaderComponent],
  templateUrl: './admin-registration-details.component.html',
  styleUrls: ['./admin-registration-details.component.css']
})
export class AdminRegistrationDetailsComponent implements OnInit {
  loading = true;
  errorMessage = '';
  userName = 'College Admin';
  userAvatarUrl: string | null = null;
  sidebarCollapsed = false;
  searchQuery = '';
  eventGroups: RegistrationDetailsGroup[] = [];
  directReviewMode = false;
  pageTitle = 'Event-wise Student Registrations';
  pageSubtitle = 'Review each student profile before approving or rejecting a registration.';

  selectedRegistration: Registration | null = null;
  reviewProfile: ReviewProfile | null = null;
  reviewLoading = false;
  reviewError = '';
  reviewVerified = false;
  reviewRejectReason = '';
  actionInProgress = false;

  private readonly COLLEGE_REGISTRATIONS_API_URL = '/api/registrations/college';

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly eventService: EventService,
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly auth: Auth
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    this.userAvatarUrl = currentUser?.profileImageUrl || null;
    const registrationId = this.route.snapshot.queryParamMap.get('registrationId');
    const navState = history.state?.registrationReview;

    if (registrationId && navState?.registration?.id === registrationId && navState?.profile) {
      this.directReviewMode = true;
      this.loading = false;
      this.selectedRegistration = navState.registration;
      this.reviewProfile = navState.profile;
      this.reviewRejectReason = navState.registration.rejectionReason || '';
      this.pageTitle = `Review ${navState.registration.studentName}`;
      this.pageSubtitle = `Check the full student profile for ${navState.registration.eventName} and then approve or reject the registration.`;
      return;
    }

    if (registrationId) {
      this.directReviewMode = true;
      this.loading = false;
      this.openReviewById(registrationId);
      return;
    }

    this.loadRegistrationGroups();
  }

  get filteredGroups(): RegistrationDetailsGroup[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.eventGroups;

    return this.eventGroups
      .map((group) => ({
        ...group,
        registrations: group.registrations.filter((registration) =>
          registration.studentName.toLowerCase().includes(query)
          || registration.email.toLowerCase().includes(query)
          || registration.college.toLowerCase().includes(query)
          || group.eventName.toLowerCase().includes(query)
        )
      }))
      .filter((group) => group.eventName.toLowerCase().includes(query) || group.registrations.length > 0);
  }

  get resolvedDepartmentLabel(): string {
    const department = String(this.reviewProfile?.department || '').trim();
    const departmentOther = String(this.reviewProfile?.departmentOther || '').trim();
    if (department === 'Other' && departmentOther) {
      return departmentOther;
    }

    return department || 'Not added yet';
  }

  get currentAddressPreview(): string {
    return this.formatAddress({
      state: this.reviewProfile?.currentState,
      district: this.reviewProfile?.currentDistrict,
      city: this.reviewProfile?.currentCity,
      pincode: this.reviewProfile?.currentPincode,
      line: this.reviewProfile?.currentAddressLine
    });
  }

  get permanentAddressPreview(): string {
    return this.formatAddress({
      state: this.reviewProfile?.permanentState,
      district: this.reviewProfile?.permanentDistrict,
      city: this.reviewProfile?.permanentCity,
      pincode: this.reviewProfile?.permanentPincode,
      line: this.reviewProfile?.permanentAddressLine
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/admin-dashboard']);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  goToMyEvents(): void {
    this.router.navigate(['/admin-my-events']);
  }

  handleTabChange(tab: 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries'): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  openCreateEvent(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events', create: 'true' } });
  }

  goToSummary(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'registrations' } });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
  }

  trackByGroup(_index: number, group: RegistrationDetailsGroup): string {
    return group.eventId;
  }

  trackByRegistration(_index: number, registration: Registration): string {
    return registration.id;
  }

  formatTime(value: string): string {
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return 'Recently';
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDate(value?: string): string {
    if (!value) return 'Not available';
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return 'Not available';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatStatus(status: Registration['status']): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  openReviewDetails(registration: Registration): void {
    this.router.navigate(['/admin-registration-details'], {
      queryParams: { registrationId: registration.id },
      state: {
        registrationReview: {
          registration,
          profile: registration.reviewProfile || null
        }
      }
    });
  }

  closeReviewDetails(): void {
    this.goToSummary();
  }

  approveReviewedRegistration(): void {
    if (!this.selectedRegistration || !this.reviewVerified || this.actionInProgress) return;

    this.actionInProgress = true;
    this.reviewError = '';

    this.http.patch<Registration>(
      `/api/registrations/${encodeURIComponent(this.selectedRegistration.id)}/approve`,
      {},
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (updated) => {
        this.applyRegistrationUpdate(updated);
        this.actionInProgress = false;
        this.goToSummary();
      },
      error: (error) => {
        this.reviewError = error?.error?.error || error?.error?.message || 'Unable to approve this registration right now.';
        this.actionInProgress = false;
      }
    });
  }

  rejectReviewedRegistration(): void {
    if (!this.selectedRegistration || this.actionInProgress) return;

    const reason = this.reviewRejectReason.trim();
    if (reason.length < 10) {
      this.reviewError = 'Please enter a clear rejection reason of at least 10 characters.';
      return;
    }

    this.actionInProgress = true;
    this.reviewError = '';

    this.http.patch<Registration>(
      `/api/registrations/${encodeURIComponent(this.selectedRegistration.id)}/reject`,
      { reason },
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (updated) => {
        this.applyRegistrationUpdate(updated);
        this.actionInProgress = false;
        this.goToSummary();
      },
      error: (error) => {
        this.reviewError = error?.error?.error || error?.error?.message || 'Unable to reject this registration right now.';
        this.actionInProgress = false;
      }
    });
  }

  private loadRegistrationGroups(): void {
    forkJoin({
      events: this.eventService.fetchCollegeEvents(),
      registrations: this.http.get<Registration[]>(this.COLLEGE_REGISTRATIONS_API_URL, { headers: this.getAuthHeaders() })
    }).subscribe({
      next: ({ events, registrations }) => {
        const collegeEvents = (events || [])
          .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

        this.eventGroups = collegeEvents.map((event) => {
          const eventRegistrations = (registrations || [])
            .filter((registration) => registration.eventId === event.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          return {
            eventId: event.id,
            eventName: event.name,
            total: eventRegistrations.length,
            statusLabel: this.eventService.convertToFrontendEvent(event).status === 'Closed' ? 'Closed' : 'Open',
            registrations: eventRegistrations
          };
        });

        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Unable to load registration details right now.';
        this.loading = false;
      }
    });
  }

  private applyRegistrationUpdate(updated: Registration): void {
    this.eventGroups = this.eventGroups.map((group) => ({
      ...group,
      registrations: group.registrations.map((registration) =>
        registration.id === updated.id ? { ...registration, ...updated } : registration
      )
    }));
  }

  private openReviewById(registrationId: string): void {
    this.directReviewMode = true;
    this.selectedRegistration = null;
    this.reviewProfile = null;
    this.reviewError = '';
    this.reviewVerified = false;
    this.reviewRejectReason = '';
    this.reviewLoading = true;

    this.http.get<RegistrationReviewResponse>(
      `${this.COLLEGE_REGISTRATIONS_API_URL}/${encodeURIComponent(registrationId)}/review`,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        this.selectedRegistration = response.registration;
        this.reviewProfile = response.profile;
        this.reviewRejectReason = response.registration.rejectionReason || '';
        this.pageTitle = `Review ${response.registration.studentName}`;
        this.pageSubtitle = `Check the full student profile for ${response.registration.eventName} and then approve or reject the registration.`;
        this.reviewLoading = false;
      },
      error: (error) => {
        this.reviewError = error?.error?.message || 'Unable to load student profile review details right now.';
        this.reviewLoading = false;
      }
    });
  }

  private formatAddress(value: {
    state?: string;
    district?: string;
    city?: string;
    pincode?: string;
    line?: string;
  }): string {
    const parts = [value.line, value.city, value.district, value.state, value.pincode]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return parts.length ? parts.join(', ') : 'Not added yet';
  }

  private getAuthHeaders(): HttpHeaders {
    return this.authService.getAuthHeaders();
  }
}
