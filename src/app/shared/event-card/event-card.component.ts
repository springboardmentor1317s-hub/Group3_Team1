
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
  @Output() registerClicked = new EventEmitter<void>();

  constructor(private router: Router) {}

  get safeDescription(): string {
    const text = (this.event?.description || '').trim();
    if (!text) return 'Explore this campus experience and check details.';
    return text.length > 90 ? `${text.slice(0, 90)}...` : text;
  }

  get statusLabel(): string {
    if (this.event.status === 'Registered') return 'Registered';
    if (this.event.status === 'Closed') return 'Closed';
    if (this.event.status === 'Full') return 'Full';
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

  openDetails(): void {
    if (!this.event?.id) return;
    this.router.navigate(['/student-event', this.event.id]);
  }

  onRegisterClick(): void {
    if (!this.registerDisabled) {
      this.registerClicked.emit();
    }
  }
}
