import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../auth/auth';
import { SuperAdminEvent, SuperAdminService } from './super-admin-service';

@Component({
  selector: 'app-super-admin-events',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-events.component.html',
  styleUrls: ['./super-admin-dashboard.css', './super-admin-events.component.css']
})
export class SuperAdminEventsComponent implements OnInit {
  events: SuperAdminEvent[] = [];
  isLoadingEvents = false;
  eventsError = '';
  isDeletingEvent = false;
  deletingEventId = '';
  deletingError = '';
  showDetailsModal = false;
  selectedEvent: SuperAdminEvent | null = null;

  constructor(
    private auth: Auth,
    private router: Router,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadEvents();
  }

  loadEvents(): void {
    this.isLoadingEvents = true;
    this.eventsError = '';

    this.superAdminService.getAllEvents().subscribe({
      next: (events) => {
        this.events = events;
        this.isLoadingEvents = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.events = [];
        this.isLoadingEvents = false;
        this.eventsError = 'Failed to load events.';
        this.cdr.detectChanges();
      }
    });
  }

  trackEvent(_: number, event: SuperAdminEvent): string {
    return event.id;
  }

  openEventDetails(event: SuperAdminEvent): void {
    this.selectedEvent = event;
    this.showDetailsModal = true;
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedEvent = null;
  }

  deleteEvent(event: SuperAdminEvent): void {
    if (this.isDeletingEvent) {
      return;
    }

    const shouldDelete = window.confirm(`Delete event \"${event.name}\"?`);
    if (!shouldDelete) {
      return;
    }

    this.isDeletingEvent = true;
    this.deletingEventId = event.id;
    this.deletingError = '';

    this.superAdminService.deleteEvent(event.id).subscribe({
      next: () => {
        this.events = this.events.filter((item) => item.id !== event.id);
        if (this.selectedEvent?.id === event.id) {
          this.closeDetailsModal();
        }
        this.isDeletingEvent = false;
        this.deletingEventId = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.isDeletingEvent = false;
        this.deletingEventId = '';
        this.deletingError = 'Failed to delete event. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  getEventStatusLabel(event: SuperAdminEvent): string {
    if (!event.dateTime) {
      return 'Active';
    }

    const eventDate = new Date(event.dateTime);
    if (Number.isNaN(eventDate.getTime())) {
      return 'Active';
    }

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

    return todayOnly <= eventDateOnly ? 'Active' : 'Completed';
  }

  getEventDateLabel(event: SuperAdminEvent): string {
    if (!event.dateTime) {
      return 'Date not provided';
    }

    const date = new Date(event.dateTime);
    if (Number.isNaN(date.getTime())) {
      return event.dateTime;
    }

    return date.toLocaleString();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
