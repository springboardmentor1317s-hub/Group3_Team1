import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { EventService, BackendEvent } from '../services/event.service';
import { HttpClient } from '@angular/common/http';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { buildAdminProfileIdentifiers, filterEventsOwnedByAdmin } from '../shared/admin-owned-events.util';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, RouterLink, FormsModule, AdminDashboardSidebarComponent],
  templateUrl: './admin-registration-details.component.html',
  styleUrls: ['./admin-registration-details.component.css']
})
export class AdminRegistrationDetailsComponent implements OnInit {
  loading = true;
  errorMessage = '';
  userName = 'College Admin';
  searchQuery = '';
  eventGroups: RegistrationDetailsGroup[] = [];

  private readonly REGISTRATIONS_API_URL = '/api/registrations';

  constructor(
    private readonly router: Router,
    private readonly eventService: EventService,
    private readonly http: HttpClient
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    const identifiers = buildAdminProfileIdentifiers({
      userId: currentUser?.userId,
      id: currentUser?.id || currentUser?._id,
      email: currentUser?.email,
      name: currentUser?.name,
      college: currentUser?.college
    });

    forkJoin({
      events: this.eventService.fetchEvents(),
      registrations: this.http.get<Registration[]>(this.REGISTRATIONS_API_URL)
    }).subscribe({
      next: ({ events, registrations }) => {
        const ownedEvents = filterEventsOwnedByAdmin(events || [], identifiers)
          .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

        this.eventGroups = ownedEvents.map((event) => {
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

  get filteredGroups(): RegistrationDetailsGroup[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.eventGroups;

    return this.eventGroups
      .map((group) => ({
        ...group,
        registrations: group.registrations.filter((registration) =>
          registration.studentName.toLowerCase().includes(query) ||
          registration.email.toLowerCase().includes(query) ||
          registration.college.toLowerCase().includes(query) ||
          group.eventName.toLowerCase().includes(query)
        )
      }))
      .filter((group) => group.eventName.toLowerCase().includes(query) || group.registrations.length > 0);
  }

  goToDashboard(): void {
    this.router.navigate(['/admin-dashboard']);
  }

  goToMyEvents(): void {
    this.router.navigate(['/admin-my-events']);
  }

  handleTabChange(tab: 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback'): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  openCreateEvent(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events', create: 'true' } });
  }

  goToSummary(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'registrations' } });
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
}
