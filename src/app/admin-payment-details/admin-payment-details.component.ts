import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnChanges, OnDestroy } from '@angular/core';
import { PaymentRecord, PaymentService } from '../services/payment.service';

type PaymentEventSummary = {
  id: string;
  name: string;
  isPaid?: boolean;
  amount?: number;
  currency?: string;
  description?: string;
  location?: string;
  dateTime?: string;
  registrations?: number;
  approvedCount?: number;
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
  selectedEvent: PaymentEventSummary | null = null;
  showEventModal = false;
  loading = false;
  errorMessage = '';
  payments: PaymentRecord[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly paymentService: PaymentService) {}

  get paidEvents(): PaymentEventSummary[] {
    return (this.events || []).filter((event) => event.isPaid && Number(event.amount || 0) > 0);
  }

  get totalCollectedAmount(): number {
    return this.payments.reduce((sum, payment) => {
      if (String(payment.status || '').toLowerCase() !== 'success') {
        return sum;
      }
      return sum + Number(payment.amount || 0);
    }, 0);
  }

  get successfulPaymentsCount(): number {
    return this.payments.filter((payment) => String(payment.status || '').toLowerCase() === 'success').length;
  }

  get pendingPaymentsCount(): number {
    return this.payments.filter((payment) => String(payment.status || '').toLowerCase() === 'pending').length;
  }

  ngOnChanges(): void {
    if (!this.selectedEventId && this.paidEvents.length > 0) {
      this.openEventDetails(this.paidEvents[0]);
      return;
    }

    if (this.selectedEventId) {
      const matchedEvent = this.paidEvents.find((event) => event.id === this.selectedEventId) || null;
      if (!matchedEvent) {
        this.closeEventModal();
        this.selectedEventId = this.paidEvents[0]?.id || '';
        return;
      }
      this.selectedEvent = matchedEvent;
      if (this.showEventModal) {
        this.loadPayments();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  openEventDetails(event: PaymentEventSummary): void {
    this.selectedEventId = event.id;
    this.selectedEvent = event;
    this.showEventModal = true;
    this.loadPayments();
    this.startAutoRefresh();
  }

  closeEventModal(): void {
    this.showEventModal = false;
    this.selectedEvent = null;
    this.errorMessage = '';
    this.payments = [];
    this.loading = false;
    this.stopAutoRefresh();
  }

  formatDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Not available';
    }
    return parsed.toLocaleString('en-US');
  }

  formatAmount(amount: number | string | undefined, currency = 'INR'): string {
    const numericAmount = Number(amount || 0);
    return `${currency} ${Number.isFinite(numericAmount) ? numericAmount.toFixed(2) : '0.00'}`;
  }

  formatCompactAmount(amount: number | string | undefined, currency = 'INR'): string {
    const numericAmount = Number(amount || 0);
    return `${currency} ${Number.isFinite(numericAmount) ? numericAmount : 0}`;
  }

  getPaymentDate(payment: PaymentRecord): string {
    return this.formatDate(String(payment.verifiedAt || payment.updatedAt || payment.createdAt || ''));
  }

  getShortDescription(event: PaymentEventSummary): string {
    const text = String(event.description || '').trim();
    if (!text) {
      return 'Paid event with student payment tracking enabled.';
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 14) {
      return words.join(' ');
    }

    return `${words.slice(0, 14).join(' ')}...`;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showEventModal) {
      this.closeEventModal();
    }
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

  private startAutoRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      if (!this.showEventModal || !this.selectedEventId || this.loading) {
        return;
      }
      this.loadPayments();
    }, 5000);
  }

  private stopAutoRefresh(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
}
