import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EventService } from '../services/event.service';
import { catchError, finalize, forkJoin, of, timeout } from 'rxjs';
import { Auth } from '../auth/auth';
import { AuthService } from '../services/auth.service';
import { FeedbackService, Feedback } from '../services/feedback.service';
import { AdminFeedbackPanelComponent } from '../admin-feedback-panel/admin-feedback-panel.component';
import { AdminEventCardComponent } from '../shared/admin-event-card/admin-event-card.component';
import { StudentEventCard } from '../services/student-dashboard.service';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { AdminRegistrationsPanelComponent } from '../admin-registrations-panel/admin-registrations-panel.component';
import { isEventClosedByDate, parseEventLocalDay, resolveEventDateCandidate } from '../shared/event-date.util';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { AdminStudentStatusPanelComponent } from '../admin-student-status-panel/admin-student-status-panel.component';
import { AdminQueryPanelComponent, AdminStudentQuery } from '../admin-query-panel/admin-query-panel.component';

type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries';

interface OrganizerEvent {
  id: string;
  name: string;
  dateTime: string;
  endDate?: string | null;
  registrationDeadline?: string | null;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  category?: string;
  teamSize?: number | null;
  maxAttendees?: number | null;
  collegeName?: string;
  status: 'Active' | 'Draft' | 'Past';
  registrations: number;
  participants: number;
  approvedCount: number;
  posterDataUrl?: string | null;
}

interface Registration {
  id: string;
  studentName: string;
  studentId: string;
  studentEmail: string;
  email: string;
  college: string;
  eventName: string;
  eventId: string;
  registrationDate: string;
  submittedDate: string;
  createdAt: string;
  updatedAt?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  reviewProfile?: unknown;
}

interface AdminNotification {
  id: string;
  studentName: string;
  eventName: string;
  createdAt: string;
  message: string;
  timeLabel: string;
}

interface RegistrationGroup {
  eventId: string;
  eventName: string;
  registrations: Registration[];
  total: number;
  isClosed: boolean;
  statusLabel: 'Open' | 'Closed';
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminFeedbackPanelComponent, AdminEventCardComponent, AdminDashboardSidebarComponent, AdminRegistrationsPanelComponent, AdminCommonHeaderComponent, AdminStudentStatusPanelComponent, AdminQueryPanelComponent],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard implements OnInit, OnDestroy {

  feedbacks: Feedback[] = [];
  averageRating: number = 0;
  totalFeedbacks: number = 0;

  private readonly API_URL = '/api/events';
  private readonly COLLEGE_EVENTS_API_URL = '/api/events/college';
  private readonly REGISTRATIONS_API_URL = '/api/registrations';
  private readonly COLLEGE_REGISTRATIONS_API_URL = '/api/registrations/college';
  private readonly STUDENT_QUERIES_API_URL = '/api/student-queries';
  private readonly COLLEGE_QUERIES_API_URL = '/api/student-queries/college';
  private readonly NOTIFICATION_POLL_INTERVAL_MS = 12000;
  private notificationPollTimer: ReturnType<typeof setInterval> | null = null;
  private sidebarHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private knownRegistrationIds = new Set<string>();
  private knownRegistrationStatuses = new Map<string, Registration['status']>();
  private knownQueryIds = new Set<string>();
  private knownQueryUpdateAt = new Map<string, string>();
  private queryBootstrapDone = false;
  private notificationStorageKey = 'admin-dashboard-last-seen-registration-at';
  private myEventsCacheStorageKey = 'admin-my-events-cache';
  private currentCollege = '';
  adminCollegeName = '';

  constructor(
    private readonly http: HttpClient,
    private readonly eventService: EventService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly auth: Auth,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly feedbackService: FeedbackService
  ) {}

  @ViewChild('dashboardSearchInput') private dashboardSearchInput?: ElementRef<HTMLInputElement>;

  openCreateModal(): void {
    this.router.navigate(['/admin-create-event']);
  }

  openEditModal(event: OrganizerEvent): void {
    if (!this.isCollegeEvent(event)) {
      this.showErrorToast('You can edit only the events from your college dashboard.');
      return;
    }
    try {
      sessionStorage.setItem(`admin-edit-event:${event.id}`, JSON.stringify(event));
    } catch {}
    this.router.navigate(['/admin-create-event'], {
      queryParams: { edit: event.id },
      state: { editingEvent: event }
    });
  }

  private refreshEvents(): void {
    this.http.get<OrganizerEvent[]>(this.COLLEGE_EVENTS_API_URL, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.events = data;
        this.persistMyEventsCache(data);
        this.refreshEventStatuses();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error refreshing events', err);
      }
    });
  }

  userName: string = '';
  userAvatarUrl: string | null = null;
  sidebarCollapsed = false;
  isDarkMode: boolean = false;
  isSidebarPinned = true;
  isSidebarHovered = false;
  activeTab: DashboardTab = 'overview';
  private manageHiddenEventIds = new Set<string>();

  events: OrganizerEvent[] = [];
  registrations: Registration[] = [];
  studentQueries: AdminStudentQuery[] = [];
  filteredRegistrations: Registration[] = [];
  registrationStatusFilter: 'All' | 'Pending' | 'Approved' | 'Rejected' = 'All';
  registrationSearchText: string = '';
  registrationFilter: string = 'all';
  registrationSearchQuery: string = '';
  dashboardSearchQuery: string = '';
  showNotifications = false;
  unreadNotificationCount = 0;
  notifications: AdminNotification[] = [];
  queryLoading = false;
  queryErrorMessage = '';
  querySavingId = '';
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  isLoading = true;

  ngOnInit(): void {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = user.name || 'User';
    this.userAvatarUrl = user.profileImageUrl || null;
    const userId = user.id || user._id || this.userName || 'admin';
    this.notificationStorageKey = `admin-dashboard-last-seen-registration-at-${userId}`;
    this.myEventsCacheStorageKey = this.buildMyEventsCacheStorageKey(user);
    this.currentCollege = String(user.college || '').trim().toLowerCase();
    this.adminCollegeName = String(user.college || '').trim();

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.isDarkMode = true;
    }

    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as DashboardTab | null;
      if (tab && ['overview', 'events', 'analytics', 'registrations', 'feedback', 'approvedStudents', 'queries'].includes(tab)) {
        this.activeTab = tab;
      }
      if (params.get('create') === 'true') {
        this.router.navigate(['/admin-create-event']);
      }
    });

    this.isLoading = true;
    forkJoin({
      events: this.http.get<OrganizerEvent[]>(this.COLLEGE_EVENTS_API_URL, { headers: this.getAuthHeaders() }),
      registrations: this.http.get<Registration[]>(this.COLLEGE_REGISTRATIONS_API_URL, { headers: this.getAuthHeaders() }),
      feedbacks: this.feedbackService.getAllFeedbacks().pipe(
        catchError(() => of([] as Feedback[]))
      )
    }).subscribe({
      next: ({ events, registrations, feedbacks }) => {
        const eventsWithApproved = events.map(event => ({
          ...event,
          approvedCount: registrations.filter(r => r.eventId === event.id && r.status === 'APPROVED').length
        }));
        const eventIds = new Set(eventsWithApproved.map((event) => String(event.id)));
        
        this.events = eventsWithApproved;
        this.persistMyEventsCache(eventsWithApproved);
        this.refreshEventStatuses();
        this.registrations = registrations;
        this.applyRegistrationFilters();
        this.syncEventRegistrationStats(registrations);
        
        this.feedbacks = (feedbacks || []).filter((feedback) => eventIds.has(String(feedback.eventId)));
        
        this.initializeNotifications(registrations, []);
        this.fetchCollegeQueries();
        this.startNotificationPolling();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading dashboard data', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  get averageRatingStars(): string {
    const fullStars = Math.floor(this.averageRating);
    const hasHalfStar = this.averageRating % 1 >= 0.5;
    let stars = '⭐'.repeat(fullStars);
    if (hasHalfStar) stars += '½';
    return stars;
  }

  getFeedbackCountByRating(rating: number): number {
    return this.feedbacks.filter(f => f.rating === rating).length;
  }

  getRecentFeedbacks(limit: number = 5): Feedback[] {
    return [...this.feedbacks]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  ngOnDestroy(): void {
    if (this.notificationPollTimer !== null) {
      clearInterval(this.notificationPollTimer);
      this.notificationPollTimer = null;
    }
    if (this.sidebarHoverCloseTimer !== null) {
      clearTimeout(this.sidebarHoverCloseTimer);
      this.sidebarHoverCloseTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.showNotifications) return;
    const target = event.target as Node | null;
    const wrapper = this.elementRef.nativeElement.querySelector('.notification-wrapper');
    if (target && wrapper && !wrapper.contains(target)) {
      this.showNotifications = false;
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.cdr.detectChanges();
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
    if (tab === 'queries') {
      this.fetchCollegeQueries();
    }
  }

  get isSidebarVisible(): boolean {
    return this.isSidebarPinned || this.isSidebarHovered;
  }

  toggleSidebar(): void {
    this.isSidebarPinned = !this.isSidebarPinned;
    if (this.isSidebarPinned) {
      this.isSidebarHovered = true;
    }
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
  }

  onSidebarMouseEnter(): void {
    if (this.sidebarHoverCloseTimer !== null) {
      clearTimeout(this.sidebarHoverCloseTimer);
      this.sidebarHoverCloseTimer = null;
    }
    this.isSidebarHovered = true;
  }

  onSidebarMouseLeave(): void {
    if (!this.isSidebarPinned) {
      if (this.sidebarHoverCloseTimer !== null) {
        clearTimeout(this.sidebarHoverCloseTimer);
      }
      this.sidebarHoverCloseTimer = setTimeout(() => {
        this.isSidebarHovered = false;
        this.sidebarHoverCloseTimer = null;
      }, 120);
    }
  }

  onSidebarItemClick(): void {
    if (window.innerWidth <= 1100) {
      this.isSidebarPinned = false;
      this.isSidebarHovered = false;
    }
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.markNotificationsAsRead();
    }
  }

  clearAllNotifications(): void {
    this.notifications = [];
    this.markNotificationsAsRead(this.registrations);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  goToMyEvents(): void {
    this.persistMyEventsCache(this.events);
    this.router.navigate(['/admin-my-events']);
  }

  goToRegistrationDetails(): void {
    this.router.navigate(['/admin-registration-details']);
  }

  goToOldEvents(): void {
    this.router.navigate(['/admin-old-events']);
  }

  private buildMyEventsCacheStorageKey(user: Record<string, unknown>): string {
    const cacheUserId = String(
      user?.['userId'] ||
      user?.['id'] ||
      user?.['_id'] ||
      user?.['email'] ||
      'default'
    ).trim();

    return `admin-my-events-cache:${cacheUserId}`;
  }

  private persistMyEventsCache(events: OrganizerEvent[]): void {
    try {
      localStorage.setItem(this.myEventsCacheStorageKey, JSON.stringify(events || []));
    } catch {
      return;
    }
  }

  onManageClick(event: OrganizerEvent, targetTab: DashboardTab): void {
    this.manageHiddenEventIds.add(event.id);
    this.setTab(targetTab);
  }

  isManageHidden(event: OrganizerEvent): boolean {
    return this.manageHiddenEventIds.has(event.id);
  }

  private startNotificationPolling(): void {
    if (this.notificationPollTimer !== null) {
      clearInterval(this.notificationPollTimer);
    }
    this.notificationPollTimer = setInterval(() => {
      this.pollLatestRegistrations();
    }, this.NOTIFICATION_POLL_INTERVAL_MS);
  }

  private pollLatestRegistrations(): void {
    this.http.get<Registration[]>(this.COLLEGE_REGISTRATIONS_API_URL, { headers: this.getAuthHeaders() }).subscribe({
      next: (registrations) => {
        this.handleRegistrationUpdates(registrations || []);
        this.fetchCollegeQueries(true);
      },
      error: (err) => {
        console.error('Notification poll failed', err);
      }
    });
  }

  private fetchCollegeQueries(silent = false): void {
    if (!silent) {
      this.queryLoading = true;
      this.queryErrorMessage = '';
    }

    this.http.get<AdminStudentQuery[]>(this.COLLEGE_QUERIES_API_URL, { headers: this.getAuthHeaders() }).subscribe({
      next: (queries) => {
        const normalized = (queries || []).map((query) => this.normalizeAdminQuery(query));

        if (!this.queryBootstrapDone) {
          this.studentQueries = normalized;
          this.initializeNotifications(this.registrations, normalized);
          this.queryBootstrapDone = true;
        } else {
          this.handleQueryUpdates(normalized);
        }

        this.queryLoading = false;
      },
      error: (error) => {
        if (!silent) {
          this.queryLoading = false;
          this.queryErrorMessage = error?.error?.message || 'Unable to load student queries right now.';
        }
      }
    });
  }

  private initializeNotifications(registrations: Registration[], queries: AdminStudentQuery[] = []): void {
    this.knownRegistrationIds = new Set(registrations.map((reg) => reg.id));
    this.knownRegistrationStatuses = new Map(registrations.map((reg) => [reg.id, reg.status]));
    this.knownQueryIds = new Set((queries || []).map((query) => query.id));
    this.knownQueryUpdateAt = new Map((queries || []).map((query) => [query.id, String(query.updatedAt || query.createdAt || '')]));
    const sortedRegistrations = [...registrations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const queryNotifications = (queries || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 25)
      .map((query) => this.buildQueryNotification(query));
    this.notifications = [...queryNotifications, ...sortedRegistrations.slice(0, 25).map((reg) => this.buildNotification(reg))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 25);
    const lastSeenAt = localStorage.getItem(this.notificationStorageKey) || '';
    if (!lastSeenAt) {
      this.markNotificationsAsRead(registrations);
      return;
    }
    const unreadRegistrationNotifications = sortedRegistrations
      .filter((reg) => new Date(reg.createdAt).getTime() > new Date(lastSeenAt).getTime())
      .map((reg) => this.buildNotification(reg));
    const unreadQueryNotifications = (queries || [])
      .filter((query) => new Date(query.createdAt).getTime() > new Date(lastSeenAt).getTime())
      .map((query) => this.buildQueryNotification(query));
    const unread = [...unreadQueryNotifications, ...unreadRegistrationNotifications];
    this.unreadNotificationCount = unread.length;
  }

  private handleRegistrationUpdates(registrations: Registration[]): void {
    const newRegistrations = registrations
      .filter((reg) => !this.knownRegistrationIds.has(reg.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const resubmittedRegistrations = registrations
      .filter((reg) => this.knownRegistrationStatuses.get(reg.id) === 'REJECTED' && reg.status === 'PENDING')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    if (newRegistrations.length > 0) {
      const newNotifications = newRegistrations.map((reg) => this.buildNotification(reg));
      this.notifications = [...newNotifications, ...this.notifications].slice(0, 25);
      this.unreadNotificationCount += newNotifications.length;
      const first = newRegistrations[0];
      this.showSuccessToast(`${first.studentName} registered for ${first.eventName}.`);
    }
    if (resubmittedRegistrations.length > 0) {
      const retryNotifications = resubmittedRegistrations.map((reg) => ({
        id: `${reg.id}-resubmitted`,
        studentName: reg.studentName,
        eventName: reg.eventName,
        createdAt: reg.updatedAt || reg.createdAt,
        message: `${reg.studentName} updated details and resubmitted for ${reg.eventName}`,
        timeLabel: this.formatNotificationTime(reg.updatedAt || reg.createdAt)
      }));
      this.notifications = [...retryNotifications, ...this.notifications].slice(0, 25);
      this.unreadNotificationCount += retryNotifications.length;
      const firstRetry = resubmittedRegistrations[0];
      this.showSuccessToast(`${firstRetry.studentName} resubmitted registration for ${firstRetry.eventName}.`);
    }
    this.knownRegistrationIds = new Set(registrations.map((reg) => reg.id));
    this.knownRegistrationStatuses = new Map(registrations.map((reg) => [reg.id, reg.status]));
    this.registrations = registrations;
    this.applyRegistrationFilters();
    this.syncEventRegistrationStats(registrations);
  }

  private handleQueryUpdates(queries: AdminStudentQuery[]): void {
    const normalizedQueries = (queries || []).map((query) => this.normalizeAdminQuery(query));
    const freshQueries = normalizedQueries
      .filter((query) => !this.knownQueryIds.has(query.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const updatedReplies = normalizedQueries
      .filter((query) => {
        const knownTime = this.knownQueryUpdateAt.get(query.id) || '';
        const nextTime = String(query.updatedAt || query.createdAt || '');
        if (!knownTime) return false;
        if (knownTime === nextTime) return false;
        return !!String(query.adminResponse || '').trim();
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    if (freshQueries.length > 0) {
      const queryNotifications = freshQueries.map((query) => this.buildQueryNotification(query));
      this.notifications = [...queryNotifications, ...this.notifications]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 25);
      this.unreadNotificationCount += queryNotifications.length;
      this.showSuccessToast(`${freshQueries[0].studentName} raised a new query.`);
    }

    if (updatedReplies.length > 0) {
      const replyNotifications = updatedReplies.map((query) => ({
        id: `${query.id}-reply-update`,
        studentName: query.studentName,
        eventName: query.subject || 'Student Query',
        createdAt: query.updatedAt || query.createdAt,
        message: `Query updated for ${query.studentName}: ${query.subject || 'Support Query'}`,
        timeLabel: this.formatNotificationTime(query.updatedAt || query.createdAt)
      }));
      this.notifications = [...replyNotifications, ...this.notifications]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 25);
      this.unreadNotificationCount += replyNotifications.length;
    }

    this.studentQueries = normalizedQueries;
    this.knownQueryIds = new Set(normalizedQueries.map((query) => query.id));
    this.knownQueryUpdateAt = new Map(normalizedQueries.map((query) => [query.id, String(query.updatedAt || query.createdAt || '')]));
  }

  private buildNotification(registration: Registration): AdminNotification {
    return {
      id: registration.id,
      studentName: registration.studentName,
      eventName: registration.eventName,
      createdAt: registration.createdAt,
      message: `${registration.studentName} registered for ${registration.eventName}`,
      timeLabel: this.formatNotificationTime(registration.createdAt)
    };
  }

  private formatNotificationTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private markNotificationsAsRead(sourceRegs: Registration[] = this.registrations): void {
    this.unreadNotificationCount = 0;
    const latestRegistrationTime = sourceRegs
      .map((reg) => reg.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const latestQueryTime = (this.studentQueries || [])
      .map((query) => query.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const latest = [latestRegistrationTime, latestQueryTime]
      .filter(Boolean)
      .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0];
    if (latest) {
      localStorage.setItem(this.notificationStorageKey, latest);
    }
  }

  private syncEventRegistrationStats(registrations: Registration[]): void {
    this.events = this.events.map((event) => {
      const eventRegistrations = registrations.filter((reg) => reg.eventId === event.id);
      const approvedCount = eventRegistrations.filter((reg) => reg.status === 'APPROVED').length;
      const activeCount = eventRegistrations.filter((reg) => reg.status !== 'REJECTED').length;
      return {
        ...event,
        approvedCount,
        registrations: activeCount
      };
    });
  }

  filterRegistrationsByStatus(status: 'All' | 'Pending' | 'Approved' | 'Rejected'): void {
    this.registrationStatusFilter = status;
    this.applyRegistrationFilters();
  }

  applyRegistrationFilters(): void {
    let filtered = this.getCollegeRegistrations();
    if (this.registrationStatusFilter !== 'All') {
      const statusMap: { [key: string]: string } = {
        'Pending': 'PENDING',
        'Approved': 'APPROVED',
        'Rejected': 'REJECTED'
      };
      filtered = filtered.filter((r) => r.status === statusMap[this.registrationStatusFilter]);
    }
    if (this.registrationSearchText.trim()) {
      const searchLower = this.registrationSearchText.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.studentName.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower) ||
          r.eventName.toLowerCase().includes(searchLower)
      );
    }
    this.filteredRegistrations = filtered;
  }

  filterByStatus(status: 'PENDING' | 'APPROVED' | 'REJECTED'): void {
    const statusMap: { [key: string]: 'All' | 'Pending' | 'Approved' | 'Rejected' } = {
      'PENDING': 'Pending',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected'
    };
    this.filterRegistrationsByStatus(statusMap[status]);
  }

  applyRegistrationFilter(): void {
    this.applyRegistrationFilters();
  }

  applyDashboardSearch(): void {
    this.applyRegistrationFilters();
  }

  onDashboardSearchClick(): void {
    this.applyDashboardSearch();
    const input = this.dashboardSearchInput?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    }
  }

  showApprovedStudents(): void {
    this.registrationFilter = 'approved';
    this.setTab('registrations');
    this.registrationSearchQuery = '';
    this.dashboardSearchQuery = '';
    this.applyRegistrationFilter();
  }

  showAllRegistrations(): void {
    this.registrationFilter = 'all';
    this.setTab('registrations');
    this.registrationSearchQuery = '';
    this.dashboardSearchQuery = '';
  }

  onSubmitQueryReply(payload: {
    queryId: string;
    adminResponse: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
    progressNote: string;
  }): void {
    const queryId = String(payload?.queryId || '').trim();
    const adminResponse = String(payload?.adminResponse || '').trim();
    if (!queryId || adminResponse.length < 3 || this.querySavingId) {
      return;
    }

    this.querySavingId = queryId;
    this.queryErrorMessage = '';

    this.http.patch<AdminStudentQuery>(
      `${this.STUDENT_QUERIES_API_URL}/${encodeURIComponent(queryId)}/reply`,
      {
        adminResponse,
        status: payload.status,
        progressNote: String(payload.progressNote || '').trim()
      },
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (updatedQuery) => {
        this.querySavingId = '';
        const nextId = String(updatedQuery?.id || queryId);
        this.studentQueries = this.studentQueries.map((query) => query.id === nextId ? {
          ...query,
          ...updatedQuery
        } : query);
        this.showSuccessToast('Query reply sent successfully.');
      },
      error: (error) => {
        this.querySavingId = '';
        this.queryErrorMessage = error?.error?.message || 'Unable to save query reply right now.';
      }
    });
  }

  getFilteredRegistrations(): any[] {
    let filtered = this.getCollegeRegistrations();
    const combinedSearch = `${this.registrationSearchQuery} ${this.dashboardSearchQuery}`.trim();
    if (combinedSearch) {
      const searchLower = combinedSearch.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.studentName.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower) ||
          r.studentId.toLowerCase().includes(searchLower) ||
          r.eventName.toLowerCase().includes(searchLower)
      );
    }
    if (this.registrationFilter !== 'all') {
      const statusMap: { [key: string]: string } = {
        'pending': 'PENDING',
        'approved': 'APPROVED',
        'rejected': 'REJECTED'
      };
      filtered = filtered.filter((r) => r.status === statusMap[this.registrationFilter]);
    }
    if (this.registrationFilter === 'all') {
      const grouped = filtered.reduce((acc, reg) => {
        const key = reg.eventId || reg.eventName;
        if (!acc[key]) {
          const matchedEvent = this.findEventForRegistration(reg);
          const isClosed = matchedEvent ? this.isEventClosed(matchedEvent) : false;
          acc[key] = {
            eventId: reg.eventId,
            eventName: reg.eventName,
            registrations: [],
            total: 0,
            isClosed,
            statusLabel: isClosed ? 'Closed' : 'Open'
          };
        }
        acc[key].registrations.push(reg);
        acc[key].total++;
        return acc;
      }, {} as { [key: string]: RegistrationGroup });
      return Object.values(grouped);
    }
    return filtered;
  }

  getFilteredEvents(): OrganizerEvent[] {
    let filtered = this.events.filter((e) => {
      const query = this.dashboardSearchQuery.trim().toLowerCase();
      return (
        e.name.toLowerCase().includes(query) ||
        e.location.toLowerCase().includes(query) ||
        e.organizer.toLowerCase().includes(query) ||
        (e.category ?? '').toLowerCase().includes(query)
      );
    });
    filtered.sort((a, b) => {
      const dateA = new Date(a.dateTime).getTime();
      const dateB = new Date(b.dateTime).getTime();
      return dateB - dateA;
    });
    return filtered;
  }

  reviewRegistration(registration: Registration): void {
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

  getPendingCount(): number {
    return this.getCollegeRegistrations().filter((r) => r.status === 'PENDING').length;
  }

  getApprovedCount(): number {
    return this.getCollegeRegistrations().filter((r) => r.status === 'APPROVED').length;
  }

  getRejectedCount(): number {
    return this.getCollegeRegistrations().filter((r) => r.status === 'REJECTED').length;
  }

  trackByRegistrationId(_index: number, reg: Registration): string {
    return reg.id;
  }

  private showSuccessToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'success';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  private showErrorToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'error';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  deleteEvent(event: OrganizerEvent): void {
    if (!this.isCollegeEvent(event)) {
      this.showErrorToast('You can delete only the events from your college dashboard.');
      return;
    }
    const ok = window.confirm(`Delete "${event.name}"? This can't be undone.`);
    if (!ok) return;
    this.http.delete<void>(`${this.API_URL}/${event.id}`).subscribe({
      next: () => {
        this.events = this.events.filter((e) => e.id !== event.id);
      },
      error: (err) => {
        console.error('Error deleting event', err);
        alert('Could not delete event. Please try again.');
      }
    });
  }

  exportEvents(): void {
    this.refreshEventStatuses();
    if (this.events.length === 0) {
      alert('No events to export yet.');
      return;
    }
    const rows = [
      ['Event Name', 'Date', 'Location', 'Organizer', 'Contact', 'Status', 'Registrations', 'Participants'],
      ...this.events.map((e) => [
        e.name,
        this.formatDateTime(e.dateTime),
        e.location,
        e.organizer,
        e.contact,
        e.status,
        String(e.registrations),
        String(e.participants)
      ])
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'events.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  formatDateTime(value: string): string {
    if (!value) return '';
    const date = parseEventLocalDay(value);
    if (!date) return value;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }

  trackByEventId(_index: number, event: OrganizerEvent): string {
    return event.id;
  }

  get totalStudents(): number {
    return 1245;
  }

  get dashboardStats(): Array<{ title: string; count: number; icon: string; accent: 'violet' | 'gold' | 'emerald' }> {
    return [
      { title: 'Total Events', count: this.totalEvents, icon: 'event', accent: 'violet' },
      { title: 'Active Events', count: this.activeEvents, icon: 'verified', accent: 'gold' },
      { title: 'Registrations', count: this.totalRegistrations, icon: 'groups', accent: 'emerald' }
    ];
  }

  get adminEventCards(): StudentEventCard[] {
    return this.getActiveCollegeFilteredEvents().map((event) => this.mapEventCard(event));
  }

  get recentAdminEventCards(): StudentEventCard[] {
    return this.getActiveCollegeEvents().slice(0, 3).map((event) => this.mapEventCard(event));
  }

  get groupedRegistrationsForView(): RegistrationGroup[] {
    return this.getFilteredRegistrations();
  }

  get flatRegistrationsForView(): Registration[] {
    return [];
  }

  get totalEvents(): number {
    return this.getCollegeEvents().length;
  }

  get activeEvents(): number {
    return this.getCollegeEvents().filter((e) => !this.isEventClosed(e)).length;
  }

  get totalRegistrations(): number {
    return this.getCollegeEvents().reduce((sum, e) => sum + e.registrations, 0);
  }

  get averageParticipants(): number {
    const collegeEvents = this.getCollegeEvents();
    if (collegeEvents.length === 0) return 0;
    const total = collegeEvents.reduce((sum, e) => sum + e.participants, 0);
    return Math.round(total / collegeEvents.length);
  }

  getPendingApprovals(): number {
    return this.getPendingCount();
  }

  getPendingRegistrationsCount(): number {
    return this.getPendingCount();
  }

  getApprovedRegistrationsCount(): number {
    return this.getApprovedCount();
  }

  getRejectedRegistrationsCount(): number {
    return this.getRejectedCount();
  }

  private buildQueryNotification(query: AdminStudentQuery): AdminNotification {
    return {
      id: `query-${query.id}`,
      studentName: query.studentName,
      eventName: query.subject || 'Student Query',
      createdAt: query.createdAt,
      message: `${query.studentName} asked: ${query.subject || 'Support Query'}`,
      timeLabel: this.formatNotificationTime(query.createdAt)
    };
  }

  private normalizeAdminQuery(query: AdminStudentQuery): AdminStudentQuery {
    const normalizedStatus = String(query?.status || 'OPEN').toUpperCase() as AdminStudentQuery['status'];
    const studentCollege = this.resolveStudentCollegeForQuery(query);
    return {
      ...query,
      status: normalizedStatus,
      studentCollege
    };
  }

  private resolveStudentCollegeForQuery(query: AdminStudentQuery): string {
    const queryCollege = String(query?.studentCollege || '').trim();
    if (queryCollege) {
      return queryCollege;
    }

    const queryStudentId = String(query?.studentId || '').trim().toLowerCase();
    const queryEmail = String(query?.studentEmail || '').trim().toLowerCase();

    const matchedRegistration = (this.registrations || []).find((registration) => {
      const regStudentId = String(registration?.studentId || '').trim().toLowerCase();
      const regEmail = String(registration?.studentEmail || registration?.email || '').trim().toLowerCase();
      if (queryStudentId && regStudentId && queryStudentId === regStudentId) {
        return true;
      }
      if (queryEmail && regEmail && queryEmail === regEmail) {
        return true;
      }
      return false;
    });

    return String(matchedRegistration?.college || '').trim();
  }

  get avatarText(): string {
    const name = (this.userName || '').trim();
    if (!name) return 'U';
    const firstWord = name.split(/\s+/)[0] || 'U';
    return firstWord.charAt(0).toUpperCase();
  }

  private refreshEventStatuses(): void {
    this.events = this.events.map((event) => {
      if (event.status === 'Draft') return event;
      const nextStatus: OrganizerEvent['status'] = this.isEventClosed(event) ? 'Past' : 'Active';
      if (event.status === nextStatus) return event;
      return { ...event, status: nextStatus };
    });
  }

  private getCollegeEvents(): OrganizerEvent[] {
    return this.events
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  }

  private getActiveCollegeEvents(): OrganizerEvent[] {
    return this.getCollegeEvents().filter((event) => !this.isEventClosed(event));
  }

  private getCollegeRegistrations(): Registration[] {
    const collegeEventIds = new Set(this.getCollegeEvents().map((event) => event.id));
    return this.registrations.filter((registration) => collegeEventIds.has(registration.eventId));
  }

  getCollegeFilteredEvents(): OrganizerEvent[] {
    return this.getFilteredEvents();
  }

  getActiveCollegeFilteredEvents(): OrganizerEvent[] {
    return this.getCollegeFilteredEvents().filter((event) => !this.isEventClosed(event));
  }

  private isCollegeEvent(event: OrganizerEvent): boolean {
    return true;
  }

  private mapEventCard(event: OrganizerEvent): StudentEventCard {
    const resolvedDateValue = resolveEventDateCandidate(event as OrganizerEvent & Record<string, unknown>);
    const date = parseEventLocalDay(resolvedDateValue);
    const deadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;
    const status: StudentEventCard['status'] = this.isEventClosed(event) ? 'Closed' : 'Open';
    const fallbackId = (event as OrganizerEvent & Record<string, unknown>)['_id'];
    return {
      id: String(event.id || fallbackId || ''),
      title: event.name,
      description: event.description || 'Manage this event and review registrations from one place.',
      category: event.category || 'Campus Event',
      location: event.location || 'Campus Venue',
      dateTime: resolvedDateValue || event.dateTime,
      registrationDeadline: event.registrationDeadline ?? null,
      registrationDeadlineLabel: deadlineDate && !Number.isNaN(deadlineDate.getTime())
        ? deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified',
      dateLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event.dateTime,
      timeLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'Time TBA',
      imageUrl: event.posterDataUrl || null,
      organizer: event.organizer || 'Campus Event Hub',
      contact: event.contact || 'Contact admin',
      status,
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees ?? null,
      collegeName: event.collegeName || 'Campus Event Hub',
      endDate: event.endDate ?? null
    };
  }

  private findEventForRegistration(registration: Registration): OrganizerEvent | undefined {
    return this.events.find((event) =>
      event.id === registration.eventId ||
      event.name.toLowerCase() === registration.eventName.toLowerCase()
    );
  }

  private isEventClosed(event: Pick<OrganizerEvent, 'status' | 'dateTime' | 'endDate'>): boolean {
    return isEventClosedByDate(event as Pick<OrganizerEvent, 'status' | 'dateTime' | 'endDate'> & Record<string, unknown>);
  }

  private getAuthHeaders(): HttpHeaders {
    return this.authService.getAuthHeaders();
  }
}
