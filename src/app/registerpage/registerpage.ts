import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ragisterpage',
  imports: [CommonModule,FormsModule],
  templateUrl: './registerpage.html',
  styleUrl: './registerpage.css',
})
export class Ragisterpage {

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
