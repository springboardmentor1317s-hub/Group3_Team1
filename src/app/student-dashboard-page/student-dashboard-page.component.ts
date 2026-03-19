import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import {
  StudentDashboardService,
  StudentEventCard,
  StudentDashboardSnapshot,
  StudentNotificationItem,
  StudentProfile,
  StudentRegistrationRecord
} from '../services/student-dashboard.service';

interface DashboardStat {
  title: string;
  count: number;
  icon: string;
  accent: string;
}

@Component({
  selector: 'app-student-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent],
  templateUrl: './student-dashboard-page.component.html',
  styleUrls: ['./student-dashboard-page.component.scss']
})
export class StudentDashboardPageComponent implements OnInit {
  profile: StudentProfile | null = null;
  allEvents: StudentEventCard[] = [];
  filteredEvents: StudentEventCard[] = [];
  registrations: StudentRegistrationRecord[] = [];
  notifications: StudentNotificationItem[] = [];
  categories: string[] = ['All'];
  colleges: string[] = ['All'];
  statsState = {
    upcomingEvents: 0,
    myRegistrations: 0,
    approvedEntries: 0
  };

  searchQuery = '';
  selectedCategory = 'All';
  selectedCollege = 'All';
  selectedDate = '';
  loading = true;
  registrationsLoading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  actionEventId = '';
  errorMessage = '';
  silentRefreshing = false;
  activeTab: 'dashboard' | 'events' | 'registrations' | 'feedback' = 'dashboard';
  expandedEventIds = new Set<string>();
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'feedback-section') {
        setTimeout(() => {
          document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    });
    this.prefillFromCache();
    this.loadDashboard();
    this.startNotificationsRefresh();
  }

  ngOnDestroy(): void {
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
    }
  }

  get studentName(): string {
    return this.profile?.name || JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get displayedEvents(): StudentEventCard[] {
    return this.filteredEvents.slice(0, 3);
  }

  get featuredNotification(): StudentNotificationItem | null {
    return this.notifications[0] || null;
  }

  get remainingNotifications(): StudentNotificationItem[] {
    return this.notifications.slice(1);
  }

  get stats(): DashboardStat[] {
    return [
      {
        title: 'Upcoming Events',
        count: this.statsState.upcomingEvents,
        icon: 'event_available',
        accent: 'violet'
      },
      {
        title: 'My Registrations',
        count: this.statsState.myRegistrations,
        icon: 'how_to_reg',
        accent: 'gold'
      },
      {
        title: 'Approved Entries',
        count: this.statsState.approvedEntries,
        icon: 'workspace_premium',
        accent: 'emerald'
      }
    ];
  }

  loadDashboard(): void {
    this.errorMessage = '';
    const hasWarmCache = !!this.studentDashboardService.getCachedSnapshot();
    if (!hasWarmCache) {
      this.loading = true;
      this.registrationsLoading = true;
      this.notificationsLoading = true;
    } else {
      this.silentRefreshing = true;
    }

    this.studentDashboardService.refreshDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.applySnapshot(snapshot);
      },
      error: (error) => {
        this.loading = false;
        this.registrationsLoading = false;
        this.notificationsLoading = false;
        this.silentRefreshing = false;
        if (!this.allEvents.length && !this.registrations.length) {
          this.errorMessage = error?.error?.message || 'Unable to load student dashboard right now.';
        }
      }
    });
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredEvents = this.allEvents.filter((event) => {
      const matchesQuery = !query
        || event.title.toLowerCase().includes(query)
        || event.description.toLowerCase().includes(query)
        || event.location.toLowerCase().includes(query)
        || (event.collegeName || '').toLowerCase().includes(query);
      const matchesCategory = this.selectedCategory === 'All' || event.category === this.selectedCategory;
      const matchesCollege = this.selectedCollege === 'All' || event.collegeName === this.selectedCollege;
      const matchesDate = !this.selectedDate || event.dateTime.slice(0, 10) === this.selectedDate;

      return matchesQuery && matchesCategory && matchesCollege && matchesDate;
    });
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'All';
    this.selectedCollege = 'All';
    this.selectedDate = '';
    this.applyFilters();
  }

  navigateTab(tab: 'dashboard' | 'events' | 'registrations' | 'feedback'): void {
    this.activeTab = tab;

    if (tab === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }

    if (tab === 'registrations') {
      this.router.navigate(['/student-registrations']);
      return;
    }

    if (tab === 'feedback') {
      document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openProfile(): void {
    this.router.navigate(['/student-profile']);
  }

  viewAllEvents(): void {
    this.router.navigate(['/student-events']);
  }

  openRegistrationsPage(): void {
    this.router.navigate(['/student-registrations']);
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
  }

  viewEvent(event: StudentEventCard): void {
    this.router.navigate(['/student-events'], { queryParams: { focus: event.id } });
  }

  toggleEventDescription(eventId: string): void {
    if (this.expandedEventIds.has(eventId)) {
      this.expandedEventIds.delete(eventId);
      return;
    }

    this.expandedEventIds.add(eventId);
  }

  isEventDescriptionExpanded(eventId: string): boolean {
    return this.expandedEventIds.has(eventId);
  }

  registerForEvent(event: StudentEventCard): void {
    if (event.status !== 'Open') {
      return;
    }

    this.actionEventId = event.id;
    this.studentDashboardService.applyOptimisticRegistration(event, this.profile);
    this.prefillFromCache();
    this.studentDashboardService.registerForEvent(event.id).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loadDashboard();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
        this.loadDashboard();
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  getRegisterLabel(event: StudentEventCard): string {
    if (event.status === 'Registered') {
      return 'Registered';
    }
    if (this.actionEventId === event.id) {
      return 'Joining...';
    }
    if (event.status === 'Full') {
      return 'Full';
    }
    if (event.status === 'Closed') {
      return 'Closed';
    }
    return 'Register Now';
  }

  trackById(_: number, item: StudentEventCard | StudentRegistrationRecord): string {
    return item.id;
  }

  trackNotification(_: number, item: StudentNotificationItem): string {
    return item.id;
  }

  formatNotificationTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Just now';
    }

    const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private prefillFromCache(): void {
    const cachedSnapshot = this.studentDashboardService.getCachedSnapshot();
    const cachedProfile = this.studentDashboardService.getCachedProfile();
    const cachedEvents = this.studentDashboardService.getCachedEvents();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();

    if (cachedSnapshot) {
      this.applySnapshot(cachedSnapshot);
      return;
    }

    if (cachedProfile) {
      this.profile = cachedProfile;
    }

    if (cachedEvents.length) {
      this.setEvents(cachedEvents);
      this.loading = false;
    }

    if (cachedRegistrations.length) {
      this.registrations = cachedRegistrations;
      this.registrationsLoading = false;
    }

    this.statsState = this.studentDashboardService.getCachedStats();
    this.notifications = this.studentDashboardService.getCachedNotifications();
    this.notificationsLoading = false;
  }

  private applySnapshot(snapshot: StudentDashboardSnapshot): void {
    this.profile = snapshot.profile;
    this.setEvents(snapshot.events);
    this.registrations = snapshot.registrations;
    this.statsState = snapshot.stats;
    this.notifications = snapshot.notifications || [];
    this.loading = false;
    this.registrationsLoading = false;
    this.notificationsLoading = false;
    this.silentRefreshing = false;
  }

  private setEvents(events: StudentEventCard[]): void {
    this.allEvents = [...events].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    this.categories = ['All', ...Array.from(new Set(this.allEvents.map((event) => event.category).filter(Boolean)))];
    this.colleges = ['All', ...Array.from(new Set(this.allEvents.map((event) => event.collegeName).filter(Boolean)))];
    this.applyFilters();
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.refreshDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.applySnapshot(snapshot);
        },
        error: () => undefined
      });
    }, 8000);
  }
}
