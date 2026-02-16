import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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

  constructor(private router: Router) {}

  // Call this method on form submit. Replace the fake API with your real API call.
  async onSubmit() {
    if (this.isSubmitting || this.isSuccess) return;

    // Basic client-side validation example
    if (!this.user.email || !this.user.password || this.user.password !== this.user.confirmPassword) {
      // Replace with in-form validation messages in production
      alert('Please provide valid email and matching passwords.');
      return;
    }

    this.isSubmitting = true;

    try {
      // Simulate API request latency (replace with `await this.authService.register(this.user)` )
      await new Promise((res) => setTimeout(res, 900));

      // On success show final success animation state
      this.isSubmitting = false;
      this.isSuccess = true;

      // Auto-redirect to login after 2.5s
      setTimeout(() => this.router.navigate(['/login']), 2500);
    } catch (err) {
      // handle API error
      this.isSubmitting = false;
      alert('Sign up failed. Please try again.');
    }
  }
}
