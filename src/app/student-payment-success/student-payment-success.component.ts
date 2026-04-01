import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentService } from '../services/payment.service';

@Component({
  selector: 'app-student-payment-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-payment-success.component.html',
  styleUrl: './student-payment-success.component.scss'
})
export class StudentPaymentSuccessComponent {
  readonly state = (history.state || {}) as Record<string, any>;
  downloadingReceipt = false;

  constructor(
    private readonly router: Router,
    private readonly paymentService: PaymentService
  ) {}

  get eventName(): string {
    return this.state['payment']?.eventName || this.state['event']?.title || 'Campus Event';
  }

  get studentName(): string {
    return this.state['payment']?.userName || this.state['registration']?.studentName || 'Student';
  }

  backToEvent(): void {
    const eventId = String(this.state['event']?.id || this.state['registration']?.eventId || '').trim();
    if (eventId) {
      this.router.navigate(['/student-event', eventId]);
      return;
    }
    this.router.navigate(['/student-events']);
  }

  downloadReceipt(): void {
    const paymentRecordId = String(this.state['payment']?.id || '').trim();
    if (!paymentRecordId || this.downloadingReceipt) {
      return;
    }

    this.downloadingReceipt = true;
    this.paymentService.downloadReceipt(paymentRecordId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `receipt-${this.state['payment']?.paymentId || 'payment'}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
        this.downloadingReceipt = false;
      },
      error: () => {
        this.downloadingReceipt = false;
      }
    });
  }
}
