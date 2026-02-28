import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss']
})
export class SignupComponent {
  isSubmitting = false;
  isSuccess = false;

  user = {
    name: '',
    email: '',
    college: '',
    role: 'student',
    password: '',
    confirmPassword: ''
  };

  constructor(private router: Router, private authService: AuthService) {}

  // Call backend signup endpoint
  onSubmit() {
    if (this.isSubmitting || this.isSuccess) return;

    if (!this.user.email || !this.user.password || this.user.password !== this.user.confirmPassword) {
      alert('Please provide valid email and matching passwords.');
      return;
    }

    this.isSubmitting = true;

    const userId = this.user.email.split('@')[0] || `u${Date.now()}`;
    const payload = {
      name: this.user.name || this.user.email,
      userId,
      email: this.user.email,
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
        alert(err.error?.message || 'Sign up failed.');
      }
    });
  }
}
