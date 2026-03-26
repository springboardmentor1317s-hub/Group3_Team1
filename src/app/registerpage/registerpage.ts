import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../auth.service';
import { AdminApprovalService } from '../services/admin-approval.service';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';

@Component({
  selector: 'app-registerpage',
  imports: [CommonModule,FormsModule,RouterModule,SiteFooterComponent],
  templateUrl: './registerpage.html',
  styleUrl: './registerpage.css',
})
export class Registerpage {
  showPassword = false;
  showConfirmPassword = false;
  popupMessage = '';
  isPopupOpen = false;
  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  user = {
    fullName: '',
    email: '',
    college: '',
    role: 'student',
    password: '',
    confirmPassword: ''
  };

  errorMessage = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private adminApprovalService: AdminApprovalService
  ) {}

  closePopup(): void {
    this.isPopupOpen = false;
  }

  private openPopup(message: string): void {
    this.popupMessage = message;
    this.isPopupOpen = true;
    this.errorMessage = message;
  }

  register() {
    console.log('Registering user:', this.user);
    const trimmedName = this.user.fullName.trim();
    const trimmedEmail = this.user.email.trim().toLowerCase();

    if (!trimmedName) {
      this.openPopup('Please enter your full name.');
      return;
    }

    if (!this.emailPattern.test(trimmedEmail)) {
      this.openPopup('Please enter a valid email address like name@gmail.com.');
      return;
    }

    if (!this.user.password.trim()) {
      this.openPopup('Please enter your password.');
      return;
    }

    if (this.user.password.length < 6) {
      this.openPopup('Password must be at least 6 characters long.');
      return;
    }
    
    // Check if passwords match
    if (this.user.password !== this.user.confirmPassword) {
      this.openPopup('Passwords do not match.');
      return;
    }

    this.user.fullName = trimmedName;
    this.user.email = trimmedEmail;
    this.errorMessage = '';

    const payload = {
      name: this.user.fullName,
      email: this.user.email,
      college: this.user.college,
      password: this.user.password,
      role: this.user.role
    };

    console.log('Sending payload to backend:', payload);

    this.authService.signup(payload).subscribe({
      next: (res: any) => {
        console.log('Registration Success:', res);
        if (this.user.role === 'college_admin') {
          this.adminApprovalService.saveRequest({
            name: payload.name,
            userId: payload.email,
            email: payload.email,
            college: payload.college,
            role: 'college_admin'
          });
          this.router.navigate(['/admin-approval-pending']);
          return;
        }

        // Keep existing success page for students.
        this.router.navigate(['/signup-success']);
      },
      error: (err) => {
        console.log('Registration Failed:', err);
        this.openPopup(err.error?.message || 'Registration failed. Please try again.');
      }
    });
  }
}
