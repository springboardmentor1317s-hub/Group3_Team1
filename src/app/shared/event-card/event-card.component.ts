
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
  @Input() showRatingSummary = false;
  @Input() ratingAverage: number | null = null;
  @Input() ratingCount = 0;
  @Input() ratingSummaryLoading = false;
  @Output() registerClicked = new EventEmitter<void>();

  constructor(private router: Router) {}

  get safeDescription(): string {
    const text = (this.event?.description || '').trim();
    if (!text) return 'Explore this campus experience and check details.';
    return text.length > 90 ? `${text.slice(0, 90)}...` : text;
  }

  get statusLabel(): string {
    const normalizedStatus = String(this.event?.status || '').toLowerCase();
    if (this.isEventExpired()) return 'Closed';
    if (normalizedStatus === 'registered') return 'Registered';
    if (normalizedStatus === 'closed') return 'Closed';
    if (normalizedStatus === 'full') return 'Full';
    return 'Open';
  }

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.72)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get registrationDeadlineText(): string {
    const rawEvent = this.event as StudentEventCard & Record<string, unknown>;
    const label = typeof rawEvent.registrationDeadlineLabel === 'string'
      ? rawEvent.registrationDeadlineLabel.trim()
      : '';
    if (label) {
      return label;
    }

    const rawDate =
      (typeof rawEvent.registrationDeadline === 'string' ? rawEvent.registrationDeadline : '') ||
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
    this.router.navigate(['/student-event', this.event.id]);
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

    const parseDate = (value?: string | null): number => {
      if (!value) return Number.NaN;
      const trimmed = String(value).trim();
      if (!trimmed) return Number.NaN;
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
      const parsed = new Date(isDateOnly ? `${trimmed}T23:59:59.999` : trimmed).getTime();
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    };

    const endTimestamp = parseDate(this.event?.endDate ?? null);
    if (!Number.isNaN(endTimestamp)) {
      return endTimestamp < Date.now();
    }

    const startTimestamp = parseDate(this.event?.dateTime ?? null);
    if (!Number.isNaN(startTimestamp)) {
      return startTimestamp < Date.now();
    }

    return false;
  }
}
