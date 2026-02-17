import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-registerpage',
  imports: [CommonModule,FormsModule,RouterModule],
  templateUrl: './registerpage.html',
  styleUrl: './registerpage.css',
})
export class Registerpage {

 user = {
    name: '',
    email: '',
    college: '',
    role: 'student',
    password: '',
    confirmPassword: ''
  };

  constructor(private router: Router) {}

  register() {
    console.log(this.user);
    // After successful registration response from API, navigate to the success page instead of alert.
    // Replace this with your API call; navigate on success:
    // this.authService.register(this.user).subscribe(() => this.router.navigate(['/signup-success']));

    // For now navigate to success directly (demo):
    this.router.navigate(['/signup-success']);
  }
}
