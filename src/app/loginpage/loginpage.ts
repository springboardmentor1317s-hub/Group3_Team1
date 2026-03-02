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
  user = {
    email: '',
    password: '',
    role: 'student' // student | college_admin
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

     if (this.user.role === 'super_admin') {
          if (this.user.email === 'super@campus.com' && this.user.password === 'super@123') {
          this.auth.setRole('super_admin');
          this.router.navigate(['/super-admin-dashboard']);
      } else {
        alert('Invalid Super Admin Credentials');
      }
      return;
    } 

  const payload: any = { identifier: this.user.email, password: this.user.password };

  this.authService.login(payload).subscribe({
    next: (res: any) => {
      console.log('Login Success', res);
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
localStorage.setItem('role', res.role);
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
