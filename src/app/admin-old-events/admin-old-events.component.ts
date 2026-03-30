import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EventService, BackendEvent } from '../services/event.service';
import { AdminEventCardComponent } from '../shared/admin-event-card/admin-event-card.component';
import { StudentEventCard } from '../services/student-dashboard.service';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { isEventClosedByDate, parseEventLocalDay, resolveEventDateCandidate } from '../shared/event-date.util';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { Auth } from '../auth/auth';

@Component({
  selector: 'app-admin-old-events',
  standalone: true,
  imports: [CommonModule, AdminEventCardComponent, AdminDashboardSidebarComponent, AdminCommonHeaderComponent],
  templateUrl: './admin-old-events.component.html',
  styleUrls: ['./admin-old-events.component.css']
})
export class AdminOldEventsComponent implements OnInit {
  loading = true;
  errorMessage = '';
  userName = 'College Admin';
  userAvatarUrl: string | null = null;
  sidebarCollapsed = false;
  eventCards: StudentEventCard[] = [];

  constructor(
    private readonly eventService: EventService,
    private readonly router: Router,
    private readonly auth: Auth
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    this.userAvatarUrl = currentUser?.profileImageUrl || null;

    this.eventService.fetchMyEvents().subscribe({
      next: (events) => {
        const oldEvents = (events || [])
          .filter((event) => this.isPastEvent(event))
          .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

        this.eventCards = oldEvents.map((event) => this.mapEventCard(event));
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Unable to load old events right now.';
        this.loading = false;
      }
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

  handleTabChange(tab: 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries' | 'attendance'): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  openCreateEvent(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events', create: 'true' } });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
  }

  trackByEventId(_index: number, event: StudentEventCard): string {
    return event.id;
  }

  private mapEventCard(event: BackendEvent): StudentEventCard {
    const resolvedDateValue = resolveEventDateCandidate(event as BackendEvent & Record<string, unknown>);
    const date = parseEventLocalDay(resolvedDateValue);
    const deadlineDate = event.registrationDeadline ? new Date(event.registrationDeadline) : null;

    return {
      id: this.resolveEventId(event),
      title: event.name,
      description: event.description || 'This event has already closed.',
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
      status: 'Closed',
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees ?? null,
      collegeName: event.collegeName || 'Campus Event Hub',
      endDate: event.endDate ?? null
    };
  }

  private resolveEventId(event: BackendEvent): string {
    const fallbackId = (event as BackendEvent & Record<string, unknown>)['_id'];
    return String(event.id || fallbackId || '');
  }

  private isPastEvent(event: BackendEvent): boolean {
    if (this.eventService.convertToFrontendEvent(event).status === 'Closed') return true;
    return isEventClosedByDate(event as BackendEvent & Record<string, unknown>);
  }
}
