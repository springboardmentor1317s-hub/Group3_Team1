import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import {
  StudentDashboardService,
  StudentEventCard
} from '../services/student-dashboard.service';

@Component({
  selector: 'app-student-events-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './student-events-page.component.html',
  styleUrls: ['./student-events-page.component.scss']
})
export class StudentEventsPageComponent implements OnInit {
  events: StudentEventCard[] = [];
  filteredEvents: StudentEventCard[] = [];
  categories: string[] = ['All'];
  searchQuery = '';
  selectedCategory = 'All';
  selectedDate = '';
  loading = true;
  actionEventId = '';
  errorMessage = '';
  private focusEventId = '';

  constructor(
    private studentDashboardService: StudentDashboardService,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.focusEventId = params.get('focus') || '';
      this.scrollToFocusedEvent();
    });

    this.prefillFromCache();
    this.loadEvents();
  }

  get studentName(): string {
    return JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  loadEvents(): void {
    this.errorMessage = '';

    this.studentDashboardService.getEvents().subscribe({
      next: (events) => {
        this.setEvents(events);
        this.loading = false;
        setTimeout(() => this.scrollToFocusedEvent(), 0);
      },
      error: (error) => {
        this.setEvents(this.studentDashboardService.getCachedEvents());
        this.loading = false;
        if (!this.events.length) {
          this.errorMessage = error?.error?.message || 'Unable to load events right now.';
        }
      }
    });
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredEvents = this.events.filter((event) => {
      const matchesQuery = !query
        || event.title.toLowerCase().includes(query)
        || event.description.toLowerCase().includes(query)
        || event.location.toLowerCase().includes(query);
      const matchesCategory = this.selectedCategory === 'All' || event.category === this.selectedCategory;
      const matchesDate = !this.selectedDate || event.dateTime.slice(0, 10) === this.selectedDate;

      return matchesQuery && matchesCategory && matchesDate;
    });
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
        this.loadEvents();
      },
      error: (error) => {
        this.actionEventId = '';
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  navigate(path: 'dashboard' | 'events' | 'registrations' | 'feedback' | 'profile'): void {
    if (path === 'dashboard') {
      this.router.navigate(['/new-student-dashboard']);
      return;
    }
    if (path === 'registrations') {
      this.router.navigate(['/new-student-dashboard'], { fragment: 'registrations-section' });
      return;
    }
    if (path === 'feedback') {
      this.router.navigate(['/new-student-dashboard'], { fragment: 'feedback-section' });
      return;
    }
    if (path === 'profile') {
      this.router.navigate(['/student-profile']);
      return;
    }
  }

  openNotifications(): void {
    this.router.navigate(['/new-student-dashboard'], { fragment: 'notifications-section' });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
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

  trackById(_: number, item: StudentEventCard): string {
    return item.id;
  }

  private scrollToFocusedEvent(): void {
    if (!this.focusEventId) {
      return;
    }

    setTimeout(() => {
      document.getElementById(`event-${this.focusEventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  private prefillFromCache(): void {
    const cachedEvents = this.studentDashboardService.getCachedEvents();
    if (cachedEvents.length) {
      this.setEvents(cachedEvents);
      this.loading = false;
    }
  }

  private setEvents(events: StudentEventCard[]): void {
    this.events = [...events].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    this.categories = ['All', ...Array.from(new Set(this.events.map((event) => event.category).filter(Boolean)))];
    this.applyFilters();
  }
}
