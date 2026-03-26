import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { AuthService } from '../auth.service';
import { StudentDashboardService } from '../services/student-dashboard.service';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';

@Component({
  selector: 'app-loginpage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent],
  templateUrl: './loginpage.html',
  styleUrls: ['./loginpage.css']
})
export class Loginpage {
  show = false;
  errorMessage = '';
  isLoggingIn = false;
  popupMessage = '';
  isPopupOpen = false;
  user = {
    email: '',
    password: '',
    role: 'student' // student | college_admin
  };

  constructor(
    private auth: Auth,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private studentDashboardService: StudentDashboardService
    ) { }

  // onRoleChange() {
  //   // Auto-fill removed as per request
  //   this.user.email = '';
  //   this.user.password = '';
  // }

  // login() {
    // if (this.user.role === 'super_admin') {
    //   if (this.user.email === 'super@campus.com' && this.user.password === 'super@123') {
    //     this.auth.setRole(this.user.role);
    //     this.router.navigate(['/super-admin-dashboard']);
    //   } else {
    //     alert('Invalid Super Admin Credentials');
    //   }
    // } else {
    //   this.auth.setRole(this.user.role);

    //   if (this.user.role === 'college_admin') {
    //     this.router.navigate(['/admin-dashboard']);
    //   } else {
    //     this.router.navigate(['/student-dashboard']);
    //   }
    // }
  // }

  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  closePopup(): void {
    this.isPopupOpen = false;
  }

  private openPopup(message: string): void {
    this.popupMessage = message;
    this.isPopupOpen = true;
    this.cdr.detectChanges();
  }

  private isValidEmail(identifier: string): boolean {
    return this.emailPattern.test(identifier.trim().toLowerCase());
  }

  login() {
  this.errorMessage = '';

  const trimmedIdentifier = this.user.email.trim().toLowerCase();
  if (!this.isValidEmail(trimmedIdentifier)) {
    this.openPopup('Please enter a valid email address like name@gmail.com.');
    return;
  }

  if (!this.user.password.trim()) {
    this.openPopup('Please enter your password.');
    return;
  }

  this.user.email = trimmedIdentifier;
  this.isLoggingIn = true;
  this.studentDashboardService.resetDashboardState();

     if (this.user.role === 'super_admin') {
          if (this.user.email.toLowerCase() === 'super@campus.com' && this.user.password === 'super@123') {
          this.auth.setRole('super_admin');
          this.router.navigate(['/super-admin-dashboard']);
      } else {
        this.errorMessage = 'Invalid credentials';
        this.openPopup('Please enter a valid super admin email and password.');
        this.cdr.detectChanges();
      }
      this.isLoggingIn = false;
      return;
    } 

  const payload: any = { identifier: this.user.email, password: this.user.password };

  this.authService.login(payload).subscribe({
    next: (res: any) => {
      console.log('Login Success', res);

      const actualRole = String(res.role || '').toLowerCase();
      const selectedRole = String(this.user.role || '').toLowerCase();
      if (actualRole && selectedRole && actualRole !== selectedRole) {
        this.errorMessage = `Account role is ${actualRole.replace('_', ' ')}. Please select the correct role.`;
        this.isLoggingIn = false;
        this.openPopup(this.errorMessage);
        this.cdr.detectChanges();
        return;
      }

      // store token and role
      if (res.token) localStorage.setItem('token', res.token);
      const currentUser = {
  id: res.userId || '',
  name: res.name || 'Student',
  userId: res.userId || '',
  email: res.email || this.user.email,
  role: res.role || 'student',
  college: res.college || 'Not Set'
};
localStorage.setItem('currentUser', JSON.stringify(currentUser));
localStorage.setItem('userName', currentUser.name)
localStorage.setItem('role', res.role);
      this.auth.setRole(res.role || this.user.role);
      // navigate
      if (res.role === 'admin' || res.role === 'college_admin') {
        this.isLoggingIn = false;
        this.router.navigate(['/admin-dashboard']);
      } else if (res.role === 'super_admin') {
        this.isLoggingIn = false;
        this.router.navigate(['/super-admin-dashboard']);
      } else {
        this.studentDashboardService.resetDashboardState();
        this.studentDashboardService.refreshDashboardSnapshot().subscribe({
          next: () => {
            this.isLoggingIn = false;
            this.router.navigate(['/student-dashboard']);
          },
          error: (dashboardError) => {
            this.isLoggingIn = false;
            this.errorMessage = dashboardError?.error?.message || 'Student dashboard data load nahi hua. Please try again.';
            this.openPopup(this.errorMessage);
            this.cdr.detectChanges();
          }
        });
      }
    },
    error: (err) => {
      this.isLoggingIn = false;
      console.log('Login Failed', err);
      if (err?.status === 403 && err?.error?.approvalStatus) {
        const status = err.error.approvalStatus;
        const reason = err.error.rejectionReason || '';
        this.router.navigate(['/admin-approval-pending'], {
          queryParams: { status, reason }
        });
        return;
      }
      this.errorMessage = err?.error?.message || 'Invalid credentials';
      this.openPopup(this.errorMessage);
      this.cdr.detectChanges();
    }
  });
}
}
