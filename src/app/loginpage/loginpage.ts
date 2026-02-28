import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-loginpage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './loginpage.html',
  styleUrls: ['./loginpage.css']
})
export class Loginpage {
  show = false;
  user: { email: string; password: string; role: string } = {
    email: '',
    password: '',
    role: '' // force user to choose
  };

  constructor(
    private auth: Auth,
    private router: Router,
    private authService: AuthService
  ) { }

  errorMessage = '';

  login() {
    // require all fields
    if (!this.user.email || !this.user.password || !this.user.role) {
      this.errorMessage = 'Please fill in email, password and select a role.';
      return;
    }

    this.errorMessage = '';

    // local super‑admin credentials (not stored in DB)
    if (
      this.user.email === 'super@campus.com' &&
      this.user.password === 'super@123' &&
      this.user.role === 'super_admin'
    ) {
      this.auth.setRole('super_admin');
      this.router.navigate(['/super-admin-dashboard']);
      return;
    }

    // perform login via service, include selected role
    this.authService
      .login(this.user.email, this.user.password, this.user.role)
      .subscribe({
        next: (res: any) => {
          console.log('Login Success', res);
          // store token and role
          if (res.token) localStorage.setItem('token', res.token);
          this.auth.setRole(res.role || this.user.role);
          // navigate
          if (res.role === 'admin' || res.role === 'college_admin' || this.user.role === 'college_admin') {
            this.router.navigate(['/admin-dashboard']);
          } else if (res.role === 'super_admin') {
            this.router.navigate(['/super-admin-dashboard']);
          } else {
            this.router.navigate(['/student-dashboard']);
          }
        },
        error: (err) => {
          console.log('Login Failed', err);
          this.errorMessage = err.error?.message || 'Invalid email or password';
        }
      });
  }
}
