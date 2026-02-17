import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';

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
    private router: Router
  ) { }

  onRoleChange() {
    // Auto-fill removed as per request
    this.user.email = '';
    this.user.password = '';
  }

  login() {
    if (this.user.role === 'super_admin') {
      if (this.user.email === 'super@campus.com' && this.user.password === 'super@123') {
        this.auth.setRole(this.user.role);
        this.router.navigate(['/super-admin-dashboard']);
      } else {
        alert('Invalid Super Admin Credentials');
      }
    } else {
      this.auth.setRole(this.user.role);

      if (this.user.role === 'college_admin') {
        this.router.navigate(['/admin-dashboard']);
      } else {
        this.router.navigate(['/student-dashboard']);
      }
    }
  }
}
