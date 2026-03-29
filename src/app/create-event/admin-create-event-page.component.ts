import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BackendEvent } from '../services/event.service';
import { CreateEventComponent } from './create-event.component';
import { AdminDashboardSidebarComponent } from '../admin-dashboard-sidebar/admin-dashboard-sidebar.component';
import { AdminCommonHeaderComponent, AdminHeaderTab } from '../shared/admin-common-header/admin-common-header.component';
import { Auth } from '../auth/auth';
import { EventService } from '../services/event.service';

type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries';

@Component({
  selector: 'app-admin-create-event-page',
  standalone: true,
  imports: [CommonModule, CreateEventComponent, AdminDashboardSidebarComponent, AdminCommonHeaderComponent],
  templateUrl: './admin-create-event-page.component.html',
  styleUrls: ['./admin-create-event-page.component.css']
})
export class AdminCreateEventPageComponent implements OnInit {
  userName = 'College Admin';
  userAvatarUrl: string | null = null;
  sidebarCollapsed = false;
  editingEvent: BackendEvent | null = null;
  isLoadingEditEvent = false;
  pageTitle = 'Create a premium event page for your campus';
  pageSubtitle = 'Keep the form focused, polished, and ready to publish with the same premium admin dashboard experience.';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: Auth,
    private readonly eventService: EventService
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    this.userAvatarUrl = currentUser?.profileImageUrl || null;
    const navigationState = (window.history.state || {}) as { editingEvent?: BackendEvent | null };

    this.route.queryParamMap.subscribe((params) => {
      const eventId = String(params.get('edit') || '').trim();
      if (!eventId) {
        this.isLoadingEditEvent = false;
        this.editingEvent = null;
        this.pageTitle = 'Create an event for your campus';
        this.pageSubtitle = 'Keep the form focused and polished. Add all the required details carefully, and use a clean, high-quality cover image for the best result.';
        return;
      }

      const routedEvent = navigationState?.editingEvent && String(navigationState.editingEvent.id || '') === eventId
        ? navigationState.editingEvent
        : null;
      const cachedEvent = this.getCachedEditingEvent(eventId);
      const immediateEvent = routedEvent || cachedEvent;

      if (immediateEvent) {
        this.editingEvent = this.normalizeEditingEvent(immediateEvent);
        this.pageTitle = `Edit ${this.editingEvent.name}`;
        this.pageSubtitle = 'Review the details carefully, update the required information, and keep the cover image clean and clear.';
        this.isLoadingEditEvent = false;
      } else {
        this.isLoadingEditEvent = true;
      }

      this.eventService.fetchCollegeEvents().subscribe({
        next: (events) => {
          const matchedEvent = (events || []).find((event) => String(event.id) === eventId) || immediateEvent || null;
          this.editingEvent = matchedEvent ? this.normalizeEditingEvent(matchedEvent) : null;
          if (matchedEvent) {
            this.cacheEditingEvent(matchedEvent);
          }
          this.pageTitle = this.editingEvent ? `Edit ${this.editingEvent.name}` : 'Edit Event';
          this.pageSubtitle = this.editingEvent
            ? 'Review the details carefully, update the required information, and keep the cover image clean and clear.'
            : 'Load the event details and continue editing here.';
          this.isLoadingEditEvent = false;
        },
        error: () => {
          if (immediateEvent) {
            this.editingEvent = this.normalizeEditingEvent(immediateEvent);
            this.pageTitle = `Edit ${this.editingEvent.name}`;
            this.pageSubtitle = 'Review the details carefully, update the required information, and keep the cover image clean and clear.';
          } else {
            this.editingEvent = null;
            this.pageTitle = 'Edit Event';
            this.pageSubtitle = 'We could not load that event right now.';
          }
          this.isLoadingEditEvent = false;
        }
      });
    });
  }

  private getCachedEditingEvent(eventId: string): BackendEvent | null {
    try {
      const raw = sessionStorage.getItem(`admin-edit-event:${eventId}`);
      if (!raw) return null;
      return JSON.parse(raw) as BackendEvent;
    } catch {
      return null;
    }
  }

  private cacheEditingEvent(event: BackendEvent): void {
    try {
      sessionStorage.setItem(`admin-edit-event:${event.id}`, JSON.stringify(event));
    } catch {}
  }

  private normalizeEditingEvent(event: BackendEvent): BackendEvent {
    return {
      ...event,
      dateTime: this.normalizeDateValue(event.dateTime),
      endDate: this.normalizeDateValue(event.endDate),
      registrationDeadline: this.normalizeDateValue(event.registrationDeadline)
    };
  }

  private normalizeDateValue(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    const yyyyMmDd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (yyyyMmDd) {
      return `${yyyyMmDd[1]}-${yyyyMmDd[2]}-${yyyyMmDd[3]}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }

    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  handleHeaderTabChange(tab: Exclude<AdminHeaderTab, 'none'>): void {
    switch (tab) {
      case 'overview':
        this.router.navigate(['/admin-dashboard']);
        break;
      case 'events':
        this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events' } });
        break;
      case 'registrations':
        this.router.navigate(['/admin-registration-details']);
        break;
    }
  }

  handleSidebarTabChange(tab: DashboardTab): void {
    if (tab === 'registrations') {
      this.router.navigate(['/admin-registration-details']);
      return;
    }

    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
  }

  goToMyEvents(): void {
    this.router.navigate(['/admin-my-events']);
  }

  goToCreateEvent(): void {
    this.router.navigate(['/admin-create-event']);
  }

  handleEventSaved(_savedEvent: BackendEvent): void {
    this.router.navigate(['/admin-my-events']);
  }

  handleCancel(): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab: 'events' } });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
