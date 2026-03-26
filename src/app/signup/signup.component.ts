import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, SiteFooterComponent],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss']
})
export class SignupComponent {
  isSubmitting = false;
  isSuccess = false;
  showPassword = false;
  showConfirmPassword = false;
  popupMessage = '';
  isPopupOpen = false;

  user = {
    name: '',
    email: '',
    college: '',
    role: 'student',
    password: '',
    confirmPassword: ''
  };

  constructor(private router: Router, private authService: AuthService) {}

  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  closePopup(): void {
    this.isPopupOpen = false;
  }

  private openPopup(message: string): void {
    this.popupMessage = message;
    this.isPopupOpen = true;
  }

  // Call backend signup endpoint
  onSubmit() {
    if (this.isSubmitting || this.isSuccess) return;

    const trimmedEmail = this.user.email.trim().toLowerCase();

    if (!this.user.name.trim()) {
      this.openPopup('Please enter your full name.');
      return;
    }

    if (!this.emailPattern.test(trimmedEmail)) {
      this.openPopup('Please enter a valid email address.');
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

    if (this.user.password !== this.user.confirmPassword) {
      this.openPopup('Password and confirm password must match.');
      return;
    }

    this.isSubmitting = true;
    this.user.email = trimmedEmail;

    const payload = {
      name: this.user.name || this.user.email,
      email: this.user.email,
      college: this.user.college,
      password: this.user.password,
      role: this.user.role
    };

    this.authService.signup(payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.isSuccess = true;
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.openPopup(err.error?.message || 'Sign up failed.');
      }
    });
  }
}
