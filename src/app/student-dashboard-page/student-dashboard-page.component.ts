import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import {
  StudentDashboardService,
  StudentEventCard,
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
  imports: [CommonModule, FormsModule, RouterModule],
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
  statsState = {
    upcomingEvents: 0,
    myRegistrations: 0,
    approvedEntries: 0
  };

  searchQuery = '';
  selectedCategory = 'All';
  selectedDate = '';
  loading = true;
  registrationsLoading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  actionEventId = '';
  errorMessage = '';
  activeTab: 'dashboard' | 'events' | 'registrations' | 'feedback' = 'dashboard';
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'registrations-section') {
        setTimeout(() => {
          document.getElementById('registrations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    this.studentDashboardService.getDashboardSnapshot().subscribe({
      next: (snapshot) => {
        this.profile = snapshot.profile;
        this.setEvents(snapshot.events);
        this.registrations = snapshot.registrations;
        this.statsState = snapshot.stats;
        this.notifications = snapshot.notifications || [];
        this.loading = false;
        this.registrationsLoading = false;
        this.notificationsLoading = false;
      },
      error: (error) => {
        this.loading = false;
        this.registrationsLoading = false;
        this.notificationsLoading = false;
        if (!this.allEvents.length && !this.registrations.length) {
          this.errorMessage = error?.error?.message || 'Unable to load student dashboard right now.';
        }
      }
    });

    this.studentDashboardService.getProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
      },
      error: () => {
        this.profile = this.studentDashboardService.getCachedProfile();
      }
    });

    this.studentDashboardService.getEvents().subscribe({
      next: (events) => {
        this.setEvents(events);
        this.loading = false;
      },
      error: (error) => {
        this.setEvents(this.studentDashboardService.getCachedEvents());
        this.loading = false;
        if (!this.allEvents.length) {
          this.errorMessage = error?.error?.message || 'Unable to load events right now.';
        }
      }
    });

    this.studentDashboardService.getRegistrations().subscribe({
      next: (registrations) => {
        this.registrations = registrations;
        this.registrationsLoading = false;
      },
      error: (error) => {
        this.registrations = this.studentDashboardService.getCachedRegistrations();
        this.registrationsLoading = false;
        if (!this.registrations.length && !this.errorMessage) {
          this.errorMessage = error?.error?.message || 'Unable to load registrations right now.';
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
        || event.location.toLowerCase().includes(query);
      const matchesCategory = this.selectedCategory === 'All' || event.category === this.selectedCategory;
      const matchesDate = !this.selectedDate || event.dateTime.slice(0, 10) === this.selectedDate;

      return matchesQuery && matchesCategory && matchesDate;
    });
  }

  navigateTab(tab: 'dashboard' | 'events' | 'registrations' | 'feedback'): void {
    this.activeTab = tab;

    if (tab === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }

    if (tab === 'registrations') {
      document.getElementById('registrations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
  }

  viewEvent(event: StudentEventCard): void {
    this.router.navigate(['/student-events'], { queryParams: { focus: event.id } });
  }

  registerForEvent(event: StudentEventCard): void {
    if (event.status !== 'Open') {
      return;
    }

    this.actionEventId = event.id;
    this.studentDashboardService.registerForEvent(event.id).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loading = true;
        this.registrationsLoading = true;
        this.loadDashboard();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  cancelRegistration(registration: StudentRegistrationRecord): void {
    const shouldCancel = window.confirm('Are you sure want to cancel from this event?');
    if (!shouldCancel) {
      return;
    }

    this.actionEventId = registration.eventId;
    this.studentDashboardService.cancelRegistration(registration.eventId).subscribe({
      next: () => {
        this.actionEventId = '';
        this.loading = true;
        this.registrationsLoading = true;
        this.loadDashboard();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to cancel registration right now.';
      }
    });
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

  getRegisterLabel(event: StudentEventCard): string {
    if (this.actionEventId === event.id) {
      return 'Please wait...';
    }
    if (event.status === 'Registered') {
      return 'Registered';
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

  @HostListener('document:click')
  closeNotificationsDropdown(): void {
    this.notificationsDropdownOpen = false;
  }

  private prefillFromCache(): void {
    const cachedProfile = this.studentDashboardService.getCachedProfile();
    const cachedEvents = this.studentDashboardService.getCachedEvents();
    const cachedRegistrations = this.studentDashboardService.getCachedRegistrations();

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

  private setEvents(events: StudentEventCard[]): void {
    this.allEvents = [...events].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    this.categories = ['All', ...Array.from(new Set(this.allEvents.map((event) => event.category).filter(Boolean)))];
    this.applyFilters();
  }

  private startNotificationsRefresh(): void {
    this.notificationsRefreshTimer = setInterval(() => {
      this.studentDashboardService.invalidateDashboardCache();
      this.studentDashboardService.getDashboardSnapshot().subscribe({
        next: (snapshot) => {
          this.notifications = snapshot.notifications || [];
          this.statsState = snapshot.stats;
          this.profile = snapshot.profile;
          this.registrations = snapshot.registrations;
          this.setEvents(snapshot.events);
          this.loading = false;
          this.registrationsLoading = false;
          this.notificationsLoading = false;
        },
        error: () => undefined
      });
    }, 15000);
  }
}
