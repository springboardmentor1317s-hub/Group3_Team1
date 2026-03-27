import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { EventService, BackendEvent } from '../services/event.service';
import { CreateEventComponent } from '../create-event/create-event.component';
import { catchError, finalize, forkJoin, of, timeout } from 'rxjs';
import { Auth } from '../auth/auth';
import { FeedbackService, Feedback } from '../services/feedback.service';
import { AdminFeedbackPanelComponent } from '../admin-feedback-panel/admin-feedback-panel.component';
import { AdminEventCardComponent } from '../shared/admin-event-card/admin-event-card.component';
import { StudentEventCard } from '../services/student-dashboard.service';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { AdminRegistrationsPanelComponent } from '../admin-registrations-panel/admin-registrations-panel.component';
import { buildAdminProfileIdentifiers } from '../shared/admin-owned-events.util';
import { isEventClosedByDate, parseEventLocalDay, resolveEventDateCandidate } from '../shared/event-date.util';

type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback';

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
  maxAttendees?: number;
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
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
  imports: [CommonModule, RouterLink, FormsModule, CreateEventComponent, AdminFeedbackPanelComponent, AdminEventCardComponent, AdminDashboardSidebarComponent, AdminRegistrationsPanelComponent],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard implements OnInit, OnDestroy {

  feedbacks: Feedback[] = [];
  averageRating: number = 0;
  totalFeedbacks: number = 0;

  private readonly API_URL = '/api/events';
  private readonly REGISTRATIONS_API_URL = '/api/registrations';
  private readonly NOTIFICATION_POLL_INTERVAL_MS = 12000;
  private notificationPollTimer: ReturnType<typeof setInterval> | null = null;
  private sidebarHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private knownRegistrationIds = new Set<string>();
  private notificationStorageKey = 'admin-dashboard-last-seen-registration-at';
  private adminIdentifiers: string[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly eventService: EventService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly auth: Auth,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly feedbackService: FeedbackService
  ) {}

  @ViewChild('dashboardSearchInput') private dashboardSearchInput?: ElementRef<HTMLInputElement>;

  openCreateModal(): void {
    this.editingEvent = null;
    this.createEventVisible = true;
  }

  openEditModal(event: OrganizerEvent): void {
    if (!this.isOwnedEvent(event)) {
      this.showErrorToast('You can edit only the events created by you.');
      return;
    }
    this.editingEvent = {
      id: event.id,
      name: event.name,
      dateTime: event.dateTime,
      endDate: event.endDate || undefined,
      registrationDeadline: event.registrationDeadline || undefined,
      location: event.location,
      organizer: event.organizer,
      contact: event.contact,
      description: event.description,
      category: event.category || undefined,
      teamSize: event.teamSize || undefined,
      maxAttendees: event.maxAttendees || undefined,
      posterDataUrl: event.posterDataUrl || null,
      status: event.status as any,
      registrations: event.registrations,
      participants: event.participants,
      collegeName: event.collegeName || undefined
    };
    this.createEventVisible = true;
  }

  handleEventSaved(savedEvent: BackendEvent): void {
    this.refreshEvents();
    this.createEventVisible = false;
    this.showSuccessToast('Event saved successfully!');
    this.setTab('events');
  }

  private refreshEvents(): void {
    this.http.get<OrganizerEvent[]>(this.API_URL).subscribe({
      next: (data) => {
        this.events = data;
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
  isDarkMode: boolean = false;
  isSidebarPinned = true;
  isSidebarHovered = false;
  activeTab: DashboardTab = 'overview';
  showCreateEventModal = false;
  private manageHiddenEventIds = new Set<string>();

  events: OrganizerEvent[] = [];
  registrations: Registration[] = [];
  filteredRegistrations: Registration[] = [];
  registrationStatusFilter: 'All' | 'Pending' | 'Approved' | 'Rejected' = 'All';
  registrationSearchText: string = '';
  registrationFilter: string = 'all';
  registrationSearchQuery: string = '';
  dashboardSearchQuery: string = '';
  rejectionModalOpen = false;
  approveModalOpen = false;
  rejectModalOpen = false;
  showNotifications = false;
  unreadNotificationCount = 0;
  notifications: AdminNotification[] = [];
  selectedRegistrationForRejection: Registration | null = null;
  selectedRegistration: Registration | null = null;
  rejectionReason: string = '';
  createEventVisible = false;
  editingEvent: BackendEvent | null = null;
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
    this.adminIdentifiers = buildAdminProfileIdentifiers({
      userId: user.userId,
      id: user.id || user._id,
      email: user.email,
      name: user.name,
      college: user.college
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.isDarkMode = true;
    }

    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as DashboardTab | null;
      if (tab && ['overview', 'events', 'analytics', 'registrations', 'feedback'].includes(tab)) {
        this.activeTab = tab;
      }
      if (params.get('create') === 'true') {
        this.openCreateModal();
      }
    });

    this.isLoading = true;
    forkJoin({
      events: this.http.get<OrganizerEvent[]>(this.API_URL),
      registrations: this.http.get<Registration[]>(this.REGISTRATIONS_API_URL),
      feedbacks: this.feedbackService.getAllFeedbacks().pipe(
        catchError(() => of([] as Feedback[]))
      )
    }).subscribe({
      next: ({ events, registrations, feedbacks }) => {
        const eventsWithApproved = events.map(event => ({
          ...event,
          approvedCount: registrations.filter(r => r.eventId === event.id && r.status === 'APPROVED').length
        }));
        
        this.events = eventsWithApproved;
        this.refreshEventStatuses();
        this.registrations = registrations;
        this.applyRegistrationFilters();
        this.syncEventRegistrationStats(registrations);
        
        this.feedbacks = feedbacks;
        
        this.initializeNotifications(registrations);
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
    this.router.navigate(['/admin-my-events']);
  }

  goToRegistrationDetails(): void {
    this.router.navigate(['/admin-registration-details']);
  }

  goToOldEvents(): void {
    this.router.navigate(['/admin-old-events']);
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
    this.http.get<Registration[]>(this.REGISTRATIONS_API_URL).subscribe({
      next: (registrations) => {
        this.handleRegistrationUpdates(registrations);
      },
      error: (err) => {
        console.error('Notification poll failed', err);
      }
    });
  }

  private initializeNotifications(registrations: Registration[]): void {
    this.knownRegistrationIds = new Set(registrations.map((reg) => reg.id));
    const sortedRegistrations = [...registrations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.notifications = sortedRegistrations.slice(0, 25).map((reg) => this.buildNotification(reg));
    const lastSeenAt = localStorage.getItem(this.notificationStorageKey) || '';
    if (!lastSeenAt) {
      this.markNotificationsAsRead(registrations);
      return;
    }
    const unread = sortedRegistrations
      .filter((reg) => new Date(reg.createdAt).getTime() > new Date(lastSeenAt).getTime())
      .map((reg) => this.buildNotification(reg));
    this.unreadNotificationCount = unread.length;
  }

  private handleRegistrationUpdates(registrations: Registration[]): void {
    const newRegistrations = registrations
      .filter((reg) => !this.knownRegistrationIds.has(reg.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (newRegistrations.length > 0) {
      const newNotifications = newRegistrations.map((reg) => this.buildNotification(reg));
      this.notifications = [...newNotifications, ...this.notifications].slice(0, 25);
      this.unreadNotificationCount += newNotifications.length;
      const first = newRegistrations[0];
      this.showSuccessToast(`${first.studentName} registered for ${first.eventName}.`);
    }
    this.knownRegistrationIds = new Set(registrations.map((reg) => reg.id));
    this.registrations = registrations;
    this.applyRegistrationFilters();
    this.syncEventRegistrationStats(registrations);
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
    const latest = sourceRegs
      .map((reg) => reg.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
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
    let filtered = this.getOwnedRegistrations();
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

  getFilteredRegistrations(): any[] {
    let filtered = this.getOwnedRegistrations();
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

  openRejectModal(registration: Registration): void {
    this.selectedRegistration = registration;
    this.rejectionReason = '';
    this.rejectModalOpen = true;
    setTimeout(() => {
      const textarea = document.getElementById('rejectionReason') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
      }
    }, 100);
  }

  closeRejectModal(): void {
    this.rejectModalOpen = false;
    this.selectedRegistration = null;
    this.rejectionReason = '';
  }

  openApproveModal(registration: Registration): void {
    this.selectedRegistration = registration;
    this.approveModalOpen = true;
  }

  closeApproveModal(): void {
    this.approveModalOpen = false;
    this.selectedRegistration = null;
  }

  confirmApproveRegistration(): void {
    if (!this.selectedRegistration) return;
    const reg = this.selectedRegistration;
    this.http.patch<Registration>(`${this.REGISTRATIONS_API_URL}/${reg.id}/approve`, {}).subscribe({
      next: (updated) => {
        const idx = this.registrations.findIndex((r) => r.id === reg.id);
        if (idx >= 0) {
          this.registrations[idx] = updated;
          this.applyRegistrationFilter();
          this.syncEventRegistrationStats(this.registrations);
        }
        this.closeApproveModal();
        this.showSuccessToast('Registration approved successfully!');
      },
      error: (err) => {
        console.error('Error approving registration', err);
        this.showErrorToast('Could not approve registration. Please try again.');
      }
    });
  }

  confirmRejectRegistration(): void {
    if (!this.selectedRegistration || !this.rejectionReason.trim()) {
      this.showErrorToast('Please enter a rejection reason.');
      return;
    }
    const reg = this.selectedRegistration;
    const reason = this.rejectionReason.trim();
    this.http.patch<Registration>(`${this.REGISTRATIONS_API_URL}/${reg.id}/reject`, {
      reason: reason
    }).subscribe({
      next: (updated) => {
        const idx = this.registrations.findIndex((r) => r.id === reg.id);
        if (idx >= 0) {
          this.registrations[idx] = updated;
          this.applyRegistrationFilter();
          this.syncEventRegistrationStats(this.registrations);
        }
        this.closeRejectModal();
        this.showSuccessToast('Registration rejected successfully!');
      },
      error: (err) => {
        console.error('Error rejecting registration', err);
        this.showErrorToast('Could not reject registration. Please try again.');
      }
    });
  }

  confirmReject(): void {
    if (confirm('Are you sure you want to reject this registration? This action cannot be undone.')) {
      this.confirmRejectRegistration();
    }
  }

  approveRegistration(registration: Registration): void {
    this.openApproveModal(registration);
  }

  getPendingCount(): number {
    return this.getOwnedRegistrations().filter((r) => r.status === 'PENDING').length;
  }

  getApprovedCount(): number {
    return this.getOwnedRegistrations().filter((r) => r.status === 'APPROVED').length;
  }

  getRejectedCount(): number {
    return this.getOwnedRegistrations().filter((r) => r.status === 'REJECTED').length;
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
    if (!this.isOwnedEvent(event)) {
      this.showErrorToast('You can delete only the events created by you.');
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
    return this.getActiveOwnedFilteredEvents().map((event) => this.mapEventCard(event));
  }

  get recentAdminEventCards(): StudentEventCard[] {
    return this.getActiveOwnedEvents().slice(0, 3).map((event) => this.mapEventCard(event));
  }

  get groupedRegistrationsForView(): RegistrationGroup[] {
    return this.getFilteredRegistrations();
  }

  get flatRegistrationsForView(): Registration[] {
    return [];
  }

  get totalEvents(): number {
    return this.getOwnedEvents().length;
  }

  get activeEvents(): number {
    return this.getOwnedEvents().filter((e) => !this.isEventClosed(e)).length;
  }

  get totalRegistrations(): number {
    return this.getOwnedEvents().reduce((sum, e) => sum + e.registrations, 0);
  }

  get averageParticipants(): number {
    const ownedEvents = this.getOwnedEvents();
    if (ownedEvents.length === 0) return 0;
    const total = ownedEvents.reduce((sum, e) => sum + e.participants, 0);
    return Math.round(total / ownedEvents.length);
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

  private getOwnedEvents(): OrganizerEvent[] {
    return this.events
      .filter((event) => this.isOwnedEvent(event))
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  }

  private getActiveOwnedEvents(): OrganizerEvent[] {
    return this.getOwnedEvents().filter((event) => !this.isEventClosed(event));
  }

  private getOwnedRegistrations(): Registration[] {
    const ownedEventIds = new Set(this.getOwnedEvents().map((event) => event.id));
    return this.registrations.filter((registration) => ownedEventIds.has(registration.eventId));
  }

  getOwnedFilteredEvents(): OrganizerEvent[] {
    return this.getFilteredEvents().filter((event) => this.isOwnedEvent(event));
  }

  getActiveOwnedFilteredEvents(): OrganizerEvent[] {
    return this.getOwnedFilteredEvents().filter((event) => !this.isEventClosed(event));
  }

  private isOwnedEvent(event: OrganizerEvent): boolean {
    const candidates = [
      (event as OrganizerEvent & Record<string, unknown>)['createdById'],
      (event as OrganizerEvent & Record<string, unknown>)['ownerId'],
      (event as OrganizerEvent & Record<string, unknown>)['adminId'],
      (event as OrganizerEvent & Record<string, unknown>)['userId'],
      (event as OrganizerEvent & Record<string, unknown>)['createdBy'],
      (event as OrganizerEvent & Record<string, unknown>)['email'],
      (event as OrganizerEvent & Record<string, unknown>)['organizer'],
      (event as OrganizerEvent & Record<string, unknown>)['collegeName']
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return candidates.some((value) => this.adminIdentifiers.includes(value));
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
      maxAttendees: event.maxAttendees || event.participants || 100,
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
}
