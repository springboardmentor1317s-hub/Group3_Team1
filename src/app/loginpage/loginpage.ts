import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';

@Component({
  selector: 'app-loginpage',
  standalone: true,
  imports: [CommonModule, FormsModule,RouterModule],
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
  ) {}

 login() {
  this.auth.setRole(this.user.role);

  if (this.user.role === 'super-admin') {
    this.router.navigate(['/super-admin-dashboard']);
  } 
  else if (this.user.role === 'college_admin') {
    this.router.navigate(['/admin-dashboard']);
  } 
  else {
    this.router.navigate(['/student-dashboard']);
  }
}
}
