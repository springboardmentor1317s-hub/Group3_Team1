import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (eventName: string, handler: (response: any) => void) => void;
    };
  }
}

export interface PaymentStatus {
  id: string;
  paymentId: string;
  orderId: string;
  eventId: string;
  eventName: string;
  amount: number;
  currency: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_FOUND';
  verified: boolean;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  paymentRequired: boolean;
}

export interface PaymentRecord {
  id: string;
  paymentId: string;
  orderId: string;
  userId: string;
  userName: string;
  userEmail: string;
  eventId: string;
  eventName: string;
  amount: number;
  currency: string;
  status: string;
  verified: boolean;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderResponse {
  alreadyPaid?: boolean;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  eventId?: string;
  eventName?: string;
  studentName?: string;
  studentEmail?: string;
  paymentId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly apiUrl = '/api/payments';
  private readonly razorpayScriptUrl = 'https://checkout.razorpay.com/v1/checkout.js';
  private readonly checkoutLogoUrl = `${window.location.origin}/icon2.png`;

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  createOrder(eventId: string): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(
      `${this.apiUrl}/create-order`,
      { eventId },
      { headers: this.authService.getAuthHeaders() }
    );
  }

  verifyPayment(payload: {
    eventId: string;
    orderId: string;
    paymentId: string;
    signature: string;
  }): Observable<{ success: boolean; verified: boolean; payment: PaymentStatus }> {
    return this.http.post<{ success: boolean; verified: boolean; payment: PaymentStatus }>(
      `${this.apiUrl}/verify-payment`,
      payload,
      { headers: this.authService.getAuthHeaders() }
    );
  }

  savePayment(payload: { eventId: string; orderId: string; paymentId: string }): Observable<{ success: boolean; payment: PaymentStatus }> {
    return this.http.post<{ success: boolean; payment: PaymentStatus }>(
      `${this.apiUrl}/save-payment`,
      payload,
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getPaymentStatus(eventId: string, userId = 'me'): Observable<PaymentStatus> {
    return this.http.get<PaymentStatus>(
      `${this.apiUrl}/status/${encodeURIComponent(userId)}/${encodeURIComponent(eventId)}`,
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getAdminEventPayments(eventId: string): Observable<PaymentRecord[]> {
    return this.http.get<PaymentRecord[]>(
      `${this.apiUrl}/admin/event-payments/${encodeURIComponent(eventId)}`,
      { headers: this.authService.getAuthHeaders() }
    );
  }

  downloadReceipt(paymentRecordId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/receipt/${encodeURIComponent(paymentRecordId)}`, {
      headers: this.authService.getAuthHeaders(),
      responseType: 'blob'
    });
  }

  openCheckout(config: {
    eventId: string;
    eventName: string;
    amount: number;
    studentName: string;
    studentEmail: string;
    contact?: string;
  }): Observable<{ orderId: string; paymentId: string; signature: string }> {
    return this.createOrder(config.eventId).pipe(
      switchMap((order) => {
        if (order.alreadyPaid && order.paymentId) {
          return from(Promise.resolve({
            orderId: order.orderId,
            paymentId: order.paymentId,
            signature: ''
          }));
        }

        return from(this.ensureRazorpayLoaded()).pipe(
          switchMap(() => from(new Promise<{ orderId: string; paymentId: string; signature: string }>((resolve, reject) => {
            const key = String(order.keyId || environment.razorpayKeyId || '').trim();
            if (!key || key.startsWith('YOUR_')) {
              reject(new Error('Razorpay key_id is not configured yet.'));
              return;
            }

            if (!window.Razorpay) {
              reject(new Error('Razorpay checkout could not be loaded.'));
              return;
            }

            const instance = new window.Razorpay({
              key,
              order_id: order.orderId,
              amount: Math.round(Number(order.amount || config.amount || 0) * 100),
              currency: order.currency || 'INR',
              name: 'Campus Event Hub',
              image: this.checkoutLogoUrl,
              description: `Payment for ${config.eventName}`,
              prefill: {
                name: config.studentName,
                email: config.studentEmail,
                contact: config.contact || ''
              },
              theme: {
                color: '#0f766e'
              },
              handler: (response: any) => {
                resolve({
                  orderId: String(response?.razorpay_order_id || order.orderId || ''),
                  paymentId: String(response?.razorpay_payment_id || ''),
                  signature: String(response?.razorpay_signature || '')
                });
              },
              modal: {
                ondismiss: () => reject(new Error('Payment popup was closed before completion.'))
              }
            });

            instance.on('payment.failed', (response: any) => {
              reject(new Error(response?.error?.description || response?.error?.reason || 'Payment failed. Please try again later.'));
            });

            instance.open();
          })))
        );
      })
    );
  }

  private ensureRazorpayLoaded(): Promise<void> {
    if (window.Razorpay) {
      return Promise.resolve();
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${this.razorpayScriptUrl}"]`);
    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout.')), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.razorpayScriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'));
      document.body.appendChild(script);
    });
  }
}
