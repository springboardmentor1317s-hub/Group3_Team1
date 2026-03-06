import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';
import { HttpClientModule } from '@angular/common/http';
import { SuperAdminService, DashboardStats, ReviewableUser } from './super-admin-service';

type AdminRequestItem = {
  id: string;
  name: string;
  userId: string;
  email: string;
  college?: string;
  role: 'college_admin';
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
};

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  templateUrl: './super-admin-dashboard.html',
  styleUrls: ['./super-admin-dashboard.css']
})
export class SuperAdminDashboard implements OnInit {
  totalAdmins = 0;
  totalEvents = 0;
  totalStudents = 0;
  adminApprovalRequests: AdminRequestItem[] = [];
  statusFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all';
  searchTerm = '';
  rejectInputById: Record<string, string> = {};
  showRejectBoxById: Record<string, boolean> = {};

  constructor(
    private auth: Auth,
    private router: Router,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.loadApprovalRequests();
  }

  loadDashboard() {
    this.superAdminService.getDashboardStats().subscribe({
      next: (data: DashboardStats) => {
        console.log('API DATA:', data);

        this.totalAdmins = data.totalAdmins;
        this.totalEvents = data.totalEvents;
        this.totalStudents = data.totalStudents;

        this.cdr.detectChanges();
      },
      error: (err) => console.log('Dashboard error:', err)
    });
  }

  loadApprovalRequests() {
    this.superAdminService.getReviewableAdminUsers().subscribe({
      next: (users: ReviewableUser[]) => {
        this.adminApprovalRequests = users
          .map((user) => ({
            id: user._id,
            name: user.name,
            userId: user.userId,
            email: user.email,
            college: user.college,
            role: 'college_admin' as const,
            status: (user.adminApprovalStatus || 'pending') as 'pending' | 'approved' | 'rejected',
            rejectionReason: user.adminRejectionReason || '',
            createdAt: user.createdAt || new Date().toISOString(),
            reviewedAt: user.adminReviewedAt
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        // Keep Total Admins card aligned with approved admin accounts only.
        this.totalAdmins = this.adminApprovalRequests.filter((item) => item.status === 'approved').length;
      },
      error: () => {
        this.adminApprovalRequests = [];
      }
    });
  }

  get filteredAdminApprovalRequests(): AdminRequestItem[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.adminApprovalRequests.filter((item) => {
      const statusOk = this.statusFilter === 'all' || item.status === this.statusFilter;
      if (!statusOk) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        item.name,
        item.userId,
        item.email,
        item.college || '',
        item.status,
        item.rejectionReason || ''
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  get pendingCount(): number {
    return this.adminApprovalRequests.filter((item) => item.status === 'pending').length;
  }

  get approvedCount(): number {
    return this.adminApprovalRequests.filter((item) => item.status === 'approved').length;
  }

  get rejectedCount(): number {
    return this.adminApprovalRequests.filter((item) => item.status === 'rejected').length;
  }

  approveRequest(request: AdminRequestItem) {
    this.superAdminService.approveAdminRequest(request.id).subscribe({
      next: () => this.loadApprovalRequests(),
      error: () => alert('Failed to approve request')
    });
  }

  showRejectReasonBox(requestId: string) {
    this.showRejectBoxById[requestId] = true;
  }

  cancelReject(requestId: string) {
    this.showRejectBoxById[requestId] = false;
    this.rejectInputById[requestId] = '';
  }

  rejectRequest(request: AdminRequestItem) {
    const reason = (this.rejectInputById[request.id] || '').trim();
    if (!reason) {
      alert('Please enter a rejection reason.');
      return;
    }

    this.superAdminService.rejectAdminRequest(request.id, reason).subscribe({
      next: () => {
        this.showRejectBoxById[request.id] = false;
        this.rejectInputById[request.id] = '';
        this.loadApprovalRequests();
      },
      error: (err) => {
        const message = err?.error?.message || 'Failed to reject request';
        alert(message);
      }
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
