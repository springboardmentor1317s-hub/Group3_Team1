import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-registerpage',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registerpage.html',
  styleUrls: ['./registerpage.css'],
})
export class Registerpage {
  user: {
    fullName: string;
    email: string;
    college: string;
    role: string;
    password: string;
    confirmPassword: string;
  } = {
    fullName: '',
    email: '',
    college: '',
    role: 'student',
    password: '',
    confirmPassword: ''
  };

  errorMessage = '';

  constructor(private router: Router, private authService: AuthService) {}

  register() {
    // basic client validation
    if (
      !this.user.email ||
      !this.user.password ||
      this.user.password !== this.user.confirmPassword
    ) {
      this.errorMessage =
        'Please fill all required fields and ensure passwords match.';
      return;
    }

    // backend expects {name, userId, email, password, role}
    const payload: any = {
      name: this.user.fullName,
      userId: this.user.email, // using email as ID for now
      email: this.user.email,
      password: this.user.password,
      role: this.user.role
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.router.navigate(['/signup-success']);
      },
      error: (err: any) => {
        console.error('Registration failed', err);
        this.errorMessage = err.error?.message || 'Registration failed';
      }
    });
  }
}
