import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { StudentEventCard } from '../../services/student-dashboard.service';
import { isEventClosedByDate } from '../event-date.util';

@Component({
  selector: 'app-admin-event-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-event-card.component.html',
  styleUrl: './admin-event-card.component.scss'
})
export class AdminEventCardComponent {
  @Input({ required: true }) event!: StudentEventCard;
  @Input() detailsRouteBase = '/admin-my-events';

  constructor(private readonly router: Router) {}

  get safeDescription(): string {
    const text = String(this.event?.description || '').trim();
    if (!text) return 'Event details are available in the view page.';
    return text.length > 110 ? `${text.slice(0, 110)}...` : text;
  }

  get statusLabel(): 'Open' | 'Closed' {
    return isEventClosedByDate(this.event as StudentEventCard & Record<string, unknown>) ? 'Closed' : 'Open';
  }

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.12), rgba(2, 6, 23, 0.74)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get registrationDeadlineText(): string {
    const rawEvent = this.event as StudentEventCard & Record<string, unknown>;
    const label = typeof rawEvent['registrationDeadlineLabel'] === 'string'
      ? String(rawEvent['registrationDeadlineLabel']).trim()
      : '';
    if (label) return label;

    const rawDate =
      (typeof rawEvent['registrationDeadline'] === 'string' ? String(rawEvent['registrationDeadline']) : '') ||
      (typeof rawEvent['registration_deadline'] === 'string' ? String(rawEvent['registration_deadline']) : '') ||
      (typeof rawEvent['lastRegistrationDate'] === 'string' ? String(rawEvent['lastRegistrationDate']) : '') ||
      (typeof rawEvent.endDate === 'string' ? rawEvent.endDate : '');

    if (!rawDate) return 'Not specified';
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return 'Not specified';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  openDetails(): void {
    if (!this.event?.id) return;
    this.router.navigate([this.detailsRouteBase, this.event.id]);
  }
}
