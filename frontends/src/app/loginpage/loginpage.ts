import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { HttpClient } from '@angular/common/http';

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
    role: 'student' // student | college_admin |super admin
  };

  constructor(
  private auth: Auth,
  private router: Router,
  private http: HttpClient
  ) {}

errorMessage = '';

login() {

  this.errorMessage = '';

  this.http.post('http://localhost:5000/api/login', this.user)
    .subscribe({
      next: (res: any) => {

        console.log("Login Success", res);

        // Save role if you want
        this.auth.setRole(res.user.role);

        // Navigate based on role
        if (res.user.role === 'college_admin') {
          this.router.navigate(['/admin-dashboard']);
        } 
        else if(res.user.role === 'super_Admin') {
          this.router.navigate(['/super_Admin-dashboard']);
        }
        else{
          
          this.router.navigate(['/student-dashboard']);
        }
        

      },

      error: (err) => {

        console.log("Login Failed", err);

        this.errorMessage =
          err.error?.message || "Invalid email or password";

      }
    });
}

}
