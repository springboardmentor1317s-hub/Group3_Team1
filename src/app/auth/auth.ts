import { Component, Injectable } from '@angular/core';
import { StudentDashboardService } from '../services/student-dashboard.service';

@Component({
  selector: 'app-auth',
  imports: [],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
})
@Injectable({ providedIn: 'root' })
export class Auth {
  constructor(private studentDashboardService: StudentDashboardService) {}

  setRole(role: string) {
    localStorage.setItem('role', role);
  }

  getRole(): string | null {
    return localStorage.getItem('role');
  }

  logout() {
    this.studentDashboardService.resetDashboardState();
    localStorage.clear();
  }
}
