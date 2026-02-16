import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  constructor(private authService: AuthService) {}

  register() {
    if (this.user.password !== this.user.confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    const payload = {
      fullName: this.user.fullName,
      email: this.user.email,
      college: this.user.college,
      role: this.user.role.toLowerCase(),
      password: this.user.password,
      confirmPassword: this.user.confirmPassword
    };

    this.authService.register(payload).subscribe({
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
