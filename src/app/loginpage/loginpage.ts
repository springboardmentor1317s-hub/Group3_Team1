import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../auth/auth';
import { HttpClient } from '@angular/common/http';

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
    private http: HttpClient
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

  this.http.post('http://localhost:5000/api/login', this.user)
    .subscribe({
      next: (res: any) => {

        console.log("Login Success", res);

        // Save role if you want
        this.auth.setRole(res.user.role);

        // Navigate based on role
        // if (res.user.role === 'college_admin') {
        //   this.router.navigate(['/admin-dashboard']);
        // } 
        // else if(res.user.role === 'super_Admin') {
        //   this.router.navigate(['/super_Admin-dashboard']);
        // }
        // else{
          
        //   this.router.navigate(['/student-dashboard']);
        // }
        
    
      this.auth.setRole(res.user.role);

      if (this.user.role === 'college_admin') {
        this.router.navigate(['/admin-dashboard']);
      } else {
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
