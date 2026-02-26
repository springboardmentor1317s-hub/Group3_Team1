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
  user: { email: string; password: string } = {
    email: '',
    password: '',
    // role is determined by server; no need for front‑end selection
  };

  constructor(
    private auth: Auth,
    private router: Router,
    private authService: AuthService
    ) { }

    errorMessage = '';

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
  login() {

    this.errorMessage = '';

    // local super‑admin credentials (not stored in DB)
    if (this.user.email === 'super@campus.com' && this.user.password === 'super@123') {
      this.auth.setRole('super_admin');
      this.router.navigate(['/super-admin-dashboard']);
      return;
    }

    // perform login via service
    this.authService
      .login(this.user.email, this.user.password)
      .subscribe({
        next: (res) => {
          console.log('Login Success', res);

          const role = this.auth.getRole();
          if (role === 'super_admin') {
            this.router.navigate(['/super-admin-dashboard']);
          } else if (role === 'college_admin') {
            this.router.navigate(['/admin-dashboard']);
          } else {
            this.router.navigate(['/student-dashboard']);
          }
        },
        error: (err) => {
          console.log('Login Failed', err);
          this.errorMessage =
            err.error?.message || 'Invalid email or password';
        }
      });
  }
}
