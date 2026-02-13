import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';   // ⭐ ADD THIS
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-registerpage',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink   
  ],
  templateUrl: './registerpage.html',
  styleUrl: './registerpage.css',
})
export class Registerpage {

  user = {
    fullName: '',
    email: '',
    college: '',
    role: 'Student',
    password: '',
    confirmPassword: ''
  };

  constructor(private authService: AuthService) {}

  register() {
    this.authService.register(this.user).subscribe({
      next: (res: any) => {
        alert("Registration Successful!");
        console.log(res);
      },
      error: (err) => {
        alert(err.error?.message || "Registration Failed");
        console.error(err);
      }
    });
  }
}
