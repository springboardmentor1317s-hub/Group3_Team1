import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-student-payment-failure',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-payment-failure.component.html',
  styleUrl: './student-payment-failure.component.scss'
})
export class StudentPaymentFailureComponent {
  readonly state = (history.state || {}) as Record<string, any>;

  constructor(private readonly router: Router) {}

  retry(): void {
    const eventId = String(this.state['event']?.id || '').trim();
    if (eventId) {
      this.router.navigate(['/student-event-registration', eventId], { state: this.state });
      return;
    }
    this.router.navigate(['/student-events']);
  }
}
