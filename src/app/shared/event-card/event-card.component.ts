
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { StudentEventCard } from '../../services/student-dashboard.service';

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-card.component.html',
  styleUrl: './event-card.component.scss'
})
export class EventCardComponent {
  @Input({ required: true }) event!: StudentEventCard;
  @Input() registerLabel = 'Register';
  @Input() registerDisabled = false;
  @Input() showRegisterButton = true;
  @Input() detailsRouteBase = '/student-event';
  @Input() showRatingSummary = false;
  @Input() ratingAverage: number | null = null;
  @Input() ratingCount = 0;
  @Input() ratingSummaryLoading = false;
  @Output() registerClicked = new EventEmitter<void>();

  constructor(private router: Router) {}

  get safeDescription(): string {
    const text = (this.event?.description || '').trim();
    if (!text) return 'Explore this campus event details.';
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 5) {
      return words.join(' ');
    }
    return `${words.slice(0, 5).join(' ')}...`;
  }

  get statusLabel(): string {
    const normalizedStatus = String(this.event?.status || '').toLowerCase();
    if (this.isEventExpired()) return 'Closed';
    if (normalizedStatus === 'registered') return 'Registered';
    if (normalizedStatus === 'closed') return 'Closed';
    if (normalizedStatus === 'full') return 'Full';
    return 'Open';
  }

  get seatCapacityLabel(): string {
    return typeof this.event?.maxAttendees === 'number' && this.event.maxAttendees > 0
      ? String(this.event.maxAttendees)
      : 'Unlimited';
  }

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.72)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get registrationDeadlineText(): string {
    const rawEvent = this.event as StudentEventCard & Record<string, unknown>;
    const label = typeof rawEvent['registrationDeadlineLabel'] === 'string'
      ? String(rawEvent['registrationDeadlineLabel']).trim()
      : '';
    if (label) {
      return label;
    }

    const rawDate =
      (typeof rawEvent['registrationDeadline'] === 'string' ? String(rawEvent['registrationDeadline']) : '') ||
      (typeof rawEvent['registration_deadline'] === 'string' ? String(rawEvent['registration_deadline']) : '') ||
      (typeof rawEvent['lastRegistrationDate'] === 'string' ? String(rawEvent['lastRegistrationDate']) : '') ||
      (typeof rawEvent.endDate === 'string' ? rawEvent.endDate : '');

    if (!rawDate) {
      return 'Not specified';
    }

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return 'Not specified';
    }

    return parsed.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  get ratingAverageLabel(): string {
    if (typeof this.ratingAverage !== 'number' || Number.isNaN(this.ratingAverage) || this.ratingAverage <= 0) {
      return '0.0';
    }
    return this.ratingAverage.toFixed(1);
  }

  get ratingStars(): number[] {
    return [1, 2, 3, 4, 5];
  }

  get shouldShowRatingSummary(): boolean {
    return this.showRatingSummary && this.isEventExpired();
  }

  getStarIcon(position: number): 'star' | 'star_half' | 'star_border' {
    const avg = typeof this.ratingAverage === 'number' ? this.ratingAverage : 0;
    if (avg >= position) return 'star';
    if (avg >= position - 0.5) return 'star_half';
    return 'star_border';
  }

  openDetails(): void {
    if (!this.event?.id) return;
    this.router.navigate([this.detailsRouteBase, this.event.id], {
      state: { event: this.event }
    });
  }

  onRegisterClick(): void {
    if (!this.registerDisabled) {
      this.registerClicked.emit();
    }
  }

  private isEventExpired(): boolean {
    const normalizedStatus = String(this.event?.status || '').toLowerCase();
    if (normalizedStatus === 'closed' || normalizedStatus === 'completed' || normalizedStatus === 'past') {
      return true;
    }

    const parseLocalDay = (value?: string | null): Date | null => {
      if (!value) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;

      const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (dateOnlyMatch) {
        const local = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
        return Number.isNaN(local.getTime()) ? null : local;
      }

      const dayFirstMatch = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(trimmed);
      if (dayFirstMatch) {
        const local = new Date(Number(dayFirstMatch[3]), Number(dayFirstMatch[2]) - 1, Number(dayFirstMatch[1]));
        return Number.isNaN(local.getTime()) ? null : local;
      }

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };

    const rawEvent = this.event as StudentEventCard & Record<string, unknown>;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const candidates = [
      this.event?.endDate ?? null,
      (typeof rawEvent['dateLabel'] === 'string' ? String(rawEvent['dateLabel']) : ''),
      this.event?.dateTime ?? null,
      (typeof rawEvent['date'] === 'string' ? String(rawEvent['date']) : ''),
      (typeof rawEvent['eventDate'] === 'string' ? String(rawEvent['eventDate']) : ''),
      (typeof rawEvent['event_date'] === 'string' ? String(rawEvent['event_date']) : ''),
      (typeof rawEvent['eventDateTime'] === 'string' ? String(rawEvent['eventDateTime']) : ''),
      (typeof rawEvent['event_date_time'] === 'string' ? String(rawEvent['event_date_time']) : ''),
      (typeof rawEvent['startDate'] === 'string' ? String(rawEvent['startDate']) : ''),
      (typeof rawEvent['start_date'] === 'string' ? String(rawEvent['start_date']) : '')
    ];

    for (const candidate of candidates) {
      const day = parseLocalDay(candidate);
      if (day) {
        return day.getTime() < today.getTime();
      }
    }

    return false;
  }
}
