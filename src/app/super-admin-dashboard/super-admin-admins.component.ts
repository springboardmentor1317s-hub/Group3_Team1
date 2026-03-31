import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../auth/auth';
import { AdminCreatedEvent, ReviewableUser, SuperAdminService } from './super-admin-service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-super-admin-admins',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-admins.component.html',
  styleUrls: ['./super-admin-dashboard.css', './super-admin-admins.component.css']
})
export class SuperAdminAdminsComponent implements OnInit {
  admins: ReviewableUser[] = [];
  isLoadingAdmins = false;
  adminsError = '';
  blockActionError = '';
  updatingBlockAdminId = '';
  searchTerm = '';
  selectedCollege = 'all';
  showDetailsModal = false;
  showEventsModal = false;
  selectedAdmin: ReviewableUser | null = null;
  selectedAdminEvents: AdminCreatedEvent[] = [];
  isLoadingAdminEvents = false;
  adminEventsError = '';
  isExporting = false;

  constructor(
    private auth: Auth,
    private router: Router,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAdmins();
  }

  loadAdmins(): void {
    this.isLoadingAdmins = true;
    this.adminsError = '';
    this.blockActionError = '';

    this.superAdminService.getReviewableAdminUsers().subscribe({
      next: (admins) => {
        this.admins = admins;
        this.isLoadingAdmins = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.admins = [];
        this.isLoadingAdmins = false;
        this.adminsError = 'Failed to load admins.';
        this.cdr.detectChanges();
      }
    });
  }

  trackAdmin(_: number, admin: ReviewableUser): string {
    return admin._id;
  }

  get collegeOptions(): string[] {
    const colleges = this.admins
      .map((admin) => (admin.college || '').trim())
      .filter((college) => college.length > 0);

    return Array.from(new Set(colleges)).sort((a, b) => a.localeCompare(b));
  }

  get filteredAdmins(): ReviewableUser[] {
    const query = this.searchTerm.trim().toLowerCase();

    return this.admins.filter((admin) => {
      const adminCollege = (admin.college || '').trim();
      const collegeMatches = this.selectedCollege === 'all' || adminCollege === this.selectedCollege;
      if (!collegeMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchText = [
        admin.name,
        admin.userId,
        admin.email,
        admin.college || ''
      ].join(' ').toLowerCase();

      return searchText.includes(query);
    });
  }

  openAdminDetails(admin: ReviewableUser): void {
    this.selectedAdmin = admin;
    this.showDetailsModal = true;
  }

  toggleAdminBlock(admin: ReviewableUser): void {
    if (this.updatingBlockAdminId) {
      return;
    }

    const shouldBlock = !Boolean(admin.isBlocked);
    this.updatingBlockAdminId = admin._id;
    this.blockActionError = '';

    this.superAdminService.updateUserBlockStatus(admin._id, shouldBlock).subscribe({
      next: () => {
        this.admins = this.admins.map((item) => {
          if (item._id === admin._id) {
            return { ...item, isBlocked: shouldBlock };
          }
          return item;
        });

        if (this.selectedAdmin?._id === admin._id) {
          this.selectedAdmin = { ...this.selectedAdmin, isBlocked: shouldBlock };
        }

        this.updatingBlockAdminId = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.updatingBlockAdminId = '';
        this.blockActionError = 'Failed to update block status. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  openAdminEvents(admin: ReviewableUser): void {
    this.selectedAdmin = admin;
    this.showEventsModal = true;
    this.isLoadingAdminEvents = true;
    this.adminEventsError = '';
    this.selectedAdminEvents = [];

    this.superAdminService.getAdminCreatedEvents(admin._id).subscribe({
      next: (events) => {
        this.selectedAdminEvents = events;
        this.isLoadingAdminEvents = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingAdminEvents = false;
        this.adminEventsError = 'Failed to load admin events.';
        this.cdr.detectChanges();
      }
    });
  }

  closeModals(): void {
    this.showDetailsModal = false;
    this.showEventsModal = false;
    this.selectedAdmin = null;
    this.selectedAdminEvents = [];
    this.isLoadingAdminEvents = false;
    this.adminEventsError = '';
  }

  getAdminStatus(admin: ReviewableUser): string {
    if (admin.isBlocked) {
      return 'Blocked';
    }

    if (admin.adminApprovalStatus === 'approved') {
      return 'Active and Approved';
    }

    return 'Pending';
  }

  exportAdminsReport(): void {
    if (this.isExporting) {
      return;
    }

    this.isExporting = true;
    this.superAdminService.exportAdminsCsv().pipe(
      finalize(() => {
        this.isExporting = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (fileBlob) => {
        const blob = new Blob([fileBlob], { type: 'text/csv;charset=utf-8;' });
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'Admins.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(objectUrl), 3000);
      },
      error: () => {
        alert('Failed to export admins report. Please try again.');
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
