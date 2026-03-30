import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface StudentApprovedEventItem {
  registrationId: string;
  eventId: string;
  eventName: string;
  eventDateTime: string;
  eventLocation: string;
  eventCategory: string;
  college: string;
  admitCardGenerated: boolean;
  admitCardGeneratedAt: string | null;
  admitCardDistributedAt?: string | null;
  canDownloadAdmitCard: boolean;
}

export interface AdminAttendanceEventItem {
  eventId: string;
  eventName: string;
  eventDateTime: string;
  eventLocation: string;
  category: string;
  approvedCount: number;
  presentCount: number;
}

export interface AdminAttendanceRosterStudent {
  registrationId: string;
  studentId: string;
  studentName: string;
  email: string;
  college: string;
  status: 'PENDING' | 'PRESENT';
  markedAt: string | null;
  admitCardGenerated: boolean;
  cardCode?: string;
}

export interface AdminAttendanceRosterResponse {
  event: {
    eventId: string;
    eventName: string;
    eventDateTime: string;
    eventLocation: string;
  };
  presentCount: number;
  totalApproved: number;
  students: AdminAttendanceRosterStudent[];
}

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private readonly apiBase = this.resolveApiBase();

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  private resolveApiBase(): string {
    if (typeof window === 'undefined') {
      return '/api/attendance';
    }

    const { protocol, hostname } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost) {
      return `${protocol}//${hostname}:5000/api/attendance`;
    }

    return '/api/attendance';
  }

  private getBinaryAuthHeaders(): { Authorization?: string } {
    const token = this.authService.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  getMyApprovedEvents(): Observable<StudentApprovedEventItem[]> {
    return this.http.get<StudentApprovedEventItem[]>(`${this.apiBase}/my-approved-events`, {
      headers: this.authService.getAuthHeaders()
    });
  }

  downloadAdmitCard(eventId: string): Observable<Blob> {
    return this.http.get(`${this.apiBase}/admit-card/${encodeURIComponent(eventId)}`, {
      headers: this.getBinaryAuthHeaders(),
      responseType: 'blob'
    });
  }

  previewAdmitCard(eventId: string, studentId?: string): Observable<Blob> {
    const studentQuery = studentId ? `&studentId=${encodeURIComponent(studentId)}` : '';
    return this.http.get(`${this.apiBase}/admit-card/${encodeURIComponent(eventId)}?adminPreview=true${studentQuery}`, {
      headers: this.getBinaryAuthHeaders(),
      responseType: 'blob'
    });
  }

  previewStudentAdmitCard(eventId: string, studentId: string): Observable<Blob> {
    return this.http.get(`${this.apiBase}/events/${encodeURIComponent(eventId)}/students/${encodeURIComponent(studentId)}/admit-card-preview`, {
      headers: this.getBinaryAuthHeaders(),
      responseType: 'blob'
    });
  }

  generateAdmitCards(eventId: string): Observable<{
    message: string;
    totalApproved: number;
    created: number;
    refreshed: number;
    failed?: number;
    details?: string;
  }> {
    return this.http.post<{
      message: string;
      totalApproved: number;
      created: number;
      refreshed: number;
      failed?: number;
      details?: string;
    }>(`${this.apiBase}/events/${encodeURIComponent(eventId)}/generate-admit-cards`, {}, {
      headers: this.authService.getAuthHeaders()
    });
  }

  distributeAdmitCards(eventId: string): Observable<{
    message: string;
    distributed: number;
    total: number;
  }> {
    return this.http.post<{
      message: string;
      distributed: number;
      total: number;
    }>(`${this.apiBase}/events/${encodeURIComponent(eventId)}/distribute-admit-cards`, {}, {
      headers: this.authService.getAuthHeaders()
    });
  }

  getTodayAttendanceEvents(): Observable<AdminAttendanceEventItem[]> {
    return this.http.get<AdminAttendanceEventItem[]>(`${this.apiBase}/events/today`, {
      headers: this.authService.getAuthHeaders()
    });
  }

  getAttendanceRoster(eventId: string): Observable<AdminAttendanceRosterResponse> {
    return this.http.get<AdminAttendanceRosterResponse>(`${this.apiBase}/events/${encodeURIComponent(eventId)}/roster`, {
      headers: this.authService.getAuthHeaders()
    });
  }

  scanAttendance(payload: string | { studentId: string; eventId: string; token: string }): Observable<{
    message: string;
    code: 'MARKED' | 'ALREADY_MARKED' | 'INVALID_QR' | 'NOT_APPROVED' | 'OUTSIDE_SCOPE';
    markedAt?: string;
    presentCount?: number;
    totalApproved?: number;
    student?: {
      id: string;
      name: string;
      portalId?: string;
      email?: string;
      college?: string;
      cardCode?: string;
      phone?: string;
      gender?: string;
      dateOfBirth?: string;
    };
  }> {
    return this.http.post<{
      message: string;
      code: 'MARKED' | 'ALREADY_MARKED' | 'INVALID_QR' | 'NOT_APPROVED' | 'OUTSIDE_SCOPE';
      markedAt?: string;
      presentCount?: number;
      totalApproved?: number;
      student?: {
        id: string;
        name: string;
        portalId?: string;
        email?: string;
        college?: string;
        cardCode?: string;
        phone?: string;
        gender?: string;
        dateOfBirth?: string;
      };
    }>(`${this.apiBase}/scan`, { payload }, {
      headers: this.authService.getAuthHeaders()
    });
  }
}
