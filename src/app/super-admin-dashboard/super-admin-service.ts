import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DashboardStats {
  totalAdmins: number;
  totalEvents: number;
  totalStudents: number;
}

@Injectable({
  providedIn: 'root'
})
export class SuperAdminService {

  private baseUrl = 'http://localhost:5000/api/superadmin';

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
}