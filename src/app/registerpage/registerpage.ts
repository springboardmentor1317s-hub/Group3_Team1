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
    private authService: AuthService
  ) {}

  register() {
    console.log('Registering user:', this.user);
    
    // Check if passwords match
    if (this.user.password !== this.user.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    // Check if required fields are filled
    if (!this.user.fullName || !this.user.email || !this.user.password) {
      this.errorMessage = 'Please fill all required fields';
      return;
    }

    // Create userId from email (before @)
    const userId = this.user.email.split('@')[0];

    // Prepare payload for backend
    const payload = {
      name: this.user.fullName,
      userId: userId,
      email: this.user.email,
      college: this.user.college,
      password: this.user.password,
      role: this.user.role
    };

    console.log('Sending payload to backend:', payload);

    this.authService.signup(payload).subscribe({
      next: (res: any) => {
        console.log('Registration Success:', res);
        // Navigate to success page on successful registration
        this.router.navigate(['/signup-success']);
      },
      error: (err) => {
        console.log('Registration Failed:', err);
        this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
      }
    });
  }
}
