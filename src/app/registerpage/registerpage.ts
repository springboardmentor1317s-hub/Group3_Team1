import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
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

  // constructor(private router: Router) {}
  constructor(
  private authService: AuthService,
  private router: Router
) {}

  // register() {
  //   console.log(this.user);
  //   // After successful registration response from API, navigate to the success page instead of alert.
  //   // Replace this with your API call; navigate on success:
  //   // this.authService.register(this.user).subscribe(() => this.router.navigate(['/signup-success']));

  //   // For now navigate to success directly (demo):
  //   this.router.navigate(['/signup-success']);
  // }

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
        // alert("Registration Successful!");
        this.router.navigate(['/signup-success']);
        console.log(res);
      },
      error: (err) => {
        alert(err.error?.message || "Registration Failed");
        console.error(err);
      }
    });
  }
}
