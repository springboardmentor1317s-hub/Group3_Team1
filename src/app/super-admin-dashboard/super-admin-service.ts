import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DashboardStats {
  totalAdmins: number;
  totalEvents: number;
  totalStudents: number;
}

export interface ReviewableUser {
  _id: string;
  name: string;
  userId: string;
  email: string;
  college?: string;
  role: string;
  adminApprovalStatus?: 'pending' | 'approved' | 'rejected';
  adminRejectionReason?: string;
  adminReviewedAt?: string;
  isBlocked?: boolean;
  createdAt?: string;
}

export interface AdminCreatedEvent {
  id: string;
  name: string;
  category?: string;
  dateTime?: string;
  location?: string;
  status?: string;
  collegeName?: string;
  organizer?: string;
  createdAt?: string;
}

export interface SuperAdminStudent {
  _id: string;
  name: string;
  userId: string;
  email: string;
  college?: string;
  role: string;
  department?: string;
  phone?: string;
  currentAddressLine?: string;
  permanentAddressLine?: string;
  profileImageUrl?: string;
  isBlocked?: boolean;
  createdAt?: string;
}

export interface StudentRegistrationSummary {
  id: string;
  eventId: string;
  eventName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  createdAt?: string;
}

export interface BlockStatusResponseUser {
  _id: string;
  name: string;
  userId: string;
  email: string;
  college?: string;
  role: string;
  adminApprovalStatus?: 'pending' | 'approved' | 'rejected';
  isBlocked?: boolean;
  createdAt?: string;
}

export interface BlockStatusResponse {
  message: string;
  user: BlockStatusResponseUser;
}

export interface SuperAdminEvent {
  id: string;
  name: string;
  dateTime: string;
  endDate?: string | null;
  registrationDeadline?: string | null;
  teamSize?: number | null;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  category?: string;
  posterDataUrl: string | null;
  status: 'Active' | 'Draft' | 'Past' | string;
  registrations: number;
  participants: number;
  maxAttendees?: number;
  attendeeIds?: string[];
  registered?: boolean;
  collegeName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SuperAdminService {

  private baseUrl = '/api/superadmin';

  constructor(private http: HttpClient) {}

  getDashboardStats(): Observable<DashboardStats> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.get<DashboardStats>(
      `${this.baseUrl}/dashboard-stats`,
      { headers }
    );
  }

  getReviewableAdminUsers(): Observable<ReviewableUser[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.get<ReviewableUser[]>(`${this.baseUrl}/admin-requests`, { headers }).pipe(
      map((users) =>
        users.filter((user) => {
          const role = (user.role || '').toLowerCase();
          return role === 'college_admin' || role === 'admin';
        })
      )
    );
  }

  approveAdminRequest(id: string): Observable<any> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.patch(`${this.baseUrl}/admin-requests/${id}/approve`, {}, { headers });
  }

  rejectAdminRequest(id: string, reason: string): Observable<any> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.patch(`${this.baseUrl}/admin-requests/${id}/reject`, { reason }, { headers });
  }

  // NEW: Admin Activity Report
  getAdminActivityReport(): Observable<any[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get<any[]>(`${this.baseUrl}/admin-activity`, { headers });
  }

  getAllStudents(): Observable<SuperAdminStudent[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get<SuperAdminStudent[]>(`${this.baseUrl}/students`, { headers });
  }

  exportStudentsCsv(): Observable<Blob> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.baseUrl}/students/export`, { headers, responseType: 'blob' });
  }

  getStudentRegistrations(studentId: string): Observable<StudentRegistrationSummary[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get<StudentRegistrationSummary[]>(`${this.baseUrl}/students/${encodeURIComponent(studentId)}/events`, { headers });
  }

  getAdminCreatedEvents(adminId: string): Observable<AdminCreatedEvent[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get<AdminCreatedEvent[]>(`${this.baseUrl}/admins/${encodeURIComponent(adminId)}/events`, { headers });
  }

  exportAdminsCsv(): Observable<Blob> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.baseUrl}/admins/export`, { headers, responseType: 'blob' });
  }

  getAllEvents(): Observable<SuperAdminEvent[]> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get<SuperAdminEvent[]>('/api/events', { headers });
  }

  deleteEvent(eventId: string): Observable<void> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.delete<void>(`/api/events/${encodeURIComponent(eventId)}`, { headers });
  }

  exportEventsCsv(): Observable<Blob> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.baseUrl}/events/export`, { headers, responseType: 'blob' });
  }

  updateUserBlockStatus(userId: string, blocked: boolean): Observable<BlockStatusResponse> {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.patch<BlockStatusResponse>(
      `${this.baseUrl}/users/${encodeURIComponent(userId)}/block`,
      { blocked },
      { headers }
    );
  }
}