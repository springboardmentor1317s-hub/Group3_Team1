import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { PaymentRecord, PaymentService } from '../services/payment.service';

type PaymentEventSummary = {
  id: string;
  name: string;
  isPaid?: boolean;
  amount?: number;
  currency?: string;
};

@Component({
  selector: 'app-admin-payment-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-payment-details.component.html',
  styleUrl: './admin-payment-details.component.css'
})
export class AdminPaymentDetailsComponent implements OnChanges {
  @Input() events: PaymentEventSummary[] = [];

  selectedEventId = '';
  loading = false;
  errorMessage = '';
  payments: PaymentRecord[] = [];

  constructor(private readonly paymentService: PaymentService) {}

  get paidEvents(): PaymentEventSummary[] {
    return (this.events || []).filter((event) => event.isPaid && Number(event.amount || 0) > 0);
  }

  ngOnChanges(): void {
    if (!this.selectedEventId && this.paidEvents.length > 0) {
      this.selectedEventId = this.paidEvents[0].id;
      this.loadPayments();
    }
  }

  selectEvent(eventId: string): void {
    this.selectedEventId = eventId;
    this.loadPayments();
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-US');
  }

  private loadPayments(): void {
    if (!this.selectedEventId) {
      this.payments = [];
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.paymentService.getAdminEventPayments(this.selectedEventId).subscribe({
      next: (payments) => {
        this.payments = payments || [];
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to load payment details right now.';
        this.loading = false;
      }
    });
  }
}
