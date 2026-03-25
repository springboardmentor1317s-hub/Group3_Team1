import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { EventService, BackendEvent } from '../services/event.service';
import { CreateEventComponent } from '../create-event/create-event.component';
import { catchError, finalize, forkJoin, timeout } from 'rxjs';
import { Auth } from '../auth/auth';



type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations';

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



@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, CreateEventComponent],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard implements OnInit, OnDestroy {

  private readonly API_URL = '/api/events';
  private readonly REGISTRATIONS_API_URL = '/api/registrations';
  private readonly NOTIFICATION_POLL_INTERVAL_MS = 12000;
  private notificationPollTimer: ReturnType<typeof setInterval> | null = null;
  private sidebarHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private knownRegistrationIds = new Set<string>();
  private notificationStorageKey = 'admin-dashboard-last-seen-registration-at';

  // ✅ Inject ChangeDetectorRef to manually trigger UI update after async data loads
  constructor(
    private readonly http: HttpClient,
    private readonly eventService: EventService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly auth: Auth,
    private readonly router: Router
  ) {}

  openCreateModal(): void {
    this.editingEvent = null;
    this.createEventVisible = true;
  }

  openEditModal(event: OrganizerEvent): void {
    // Map OrganizerEvent to BackendEvent for child component
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
    // Refresh events list using service or direct API
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

  // Create Event Component visibility
  createEventVisible = false;
  editingEvent: BackendEvent | null = null;

  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // ✅ Loading state so the template can show a spinner instead of 0
  isLoading = true;

  ngOnInit(): void {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = user.name || 'User';
    this.userAvatarUrl = user.profileImageUrl || null;
    const userId = user.id || user._id || this.userName || 'admin';
    this.notificationStorageKey = `admin-dashboard-last-seen-registration-at-${userId}`;

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.isDarkMode = true;
    }

    // ✅ Use forkJoin to fire BOTH requests in parallel and wait for BOTH to complete
    //    before updating any state. This ensures the stats are never shown as 0.
    this.isLoading = true;
    forkJoin({
      events: this.http.get<OrganizerEvent[]>(this.API_URL),
      registrations: this.http.get<Registration[]>(this.REGISTRATIONS_API_URL)
    }).subscribe({
      next: ({ events, registrations }) => {
        // Add approvedCount to events
        const eventsWithApproved = events.map(event => ({
          ...event,
          approvedCount: registrations.filter(r => r.eventId === event.id && r.status === 'APPROVED').length
        }));
        
        this.events = eventsWithApproved;
        this.refreshEventStatuses();

        this.registrations = registrations;
        this.applyRegistrationFilters();
        this.syncEventRegistrationStats(registrations);
        this.initializeNotifications(registrations);
        this.startNotificationPolling();

        this.isLoading = false;

        // ✅ Tell Angular to re-check this component's bindings right now,
        //    so totalEvents / activeEvents / totalRegistrations / averageParticipants
        //    reflect real data on first paint instead of showing 0.
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading dashboard data', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
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

    // Always keep notification history visible in the panel.
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
    let filtered = this.registrations;

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
    // Reuse existing filtering behavior; dashboardSearchQuery is applied inside getters.
    this.applyRegistrationFilters();
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
    let filtered = this.registrations;

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

    // Group by event ONLY for main Registrations tab (not for approved filter)
    if (this.registrationFilter === 'all') {
      const grouped = filtered.reduce((acc, reg) => {
        if (!acc[reg.eventName]) {
          acc[reg.eventName] = { eventName: reg.eventName, registrations: [], total: 0 };
        }
        acc[reg.eventName].registrations.push(reg);
        acc[reg.eventName].total++;
        return acc;
      }, {} as { [key: string]: { eventName: string; registrations: Registration[]; total: number } });

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
    // Sort by dateTime descending (newest first)
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
    return this.registrations.filter((r) => r.status === 'PENDING').length;
  }

  getApprovedCount(): number {
    return this.registrations.filter((r) => r.status === 'APPROVED').length;
  }

  getRejectedCount(): number {
    return this.registrations.filter((r) => r.status === 'REJECTED').length;
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

  // Remove duplicate handleEventSaved - already defined above

  deleteEvent(event: OrganizerEvent): void {
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
    const date = this.parseLocalDay(value);
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

  get totalEvents(): number {
    return this.events.length;
  }

  get activeEvents(): number {
    return this.events.filter((e) => e.status === 'Active').length;
  }

  get totalRegistrations(): number {
    return this.events.reduce((sum, e) => sum + e.registrations, 0);
  }

  get averageParticipants(): number {
    if (this.events.length === 0) return 0;
    const total = this.events.reduce((sum, e) => sum + e.participants, 0);
    return Math.round(total / this.events.length);
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
    const today = this.startOfToday();
    this.events = this.events.map((event) => {
      if (event.status === 'Draft') return event;
      const day = this.parseLocalDay(event.dateTime);
      if (!day) return event;

      const nextStatus: OrganizerEvent['status'] = day.getTime() < today.getTime() ? 'Past' : 'Active';
      if (event.status === nextStatus) return event;
      return { ...event, status: nextStatus };
    });
  }

  private isPastEventDate(value: string): boolean {
    const day = this.parseLocalDay(value);
    if (!day) return false;
    return day.getTime() < this.startOfToday().getTime();
  }

  private startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private parseLocalDay(value: string): Date | null {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const monthIndex = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const local = new Date(year, monthIndex, day);
      return Number.isNaN(local.getTime()) ? null : local;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

}

