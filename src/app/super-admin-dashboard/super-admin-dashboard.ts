import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';
import { HttpClientModule } from '@angular/common/http';
import { SuperAdminService, DashboardStats } from './super-admin-service';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './super-admin-dashboard.html',
  styleUrls: ['./super-admin-dashboard.css']
})
export class SuperAdminDashboard implements OnInit {

  totalAdmins = 0;
  totalEvents = 0;
  totalStudents = 0;

  constructor(
    private auth: Auth,
    private router: Router,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef   // 👈 ADD THIS
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard() {
    this.superAdminService.getDashboardStats().subscribe({
      next: (data: DashboardStats) => {
        console.log("API DATA:", data);

        this.totalAdmins = data.totalAdmins;
        this.totalEvents = data.totalEvents;
        this.totalStudents = data.totalStudents;

        this.cdr.detectChanges();   // 👈 FORCE UI UPDATE
      },
      error: (err) => console.log("Dashboard error:", err)
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}