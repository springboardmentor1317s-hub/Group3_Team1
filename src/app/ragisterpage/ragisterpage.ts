import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ragisterpage',
  imports: [CommonModule,FormsModule],
  templateUrl: './ragisterpage.html',
  styleUrl: './ragisterpage.css',
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

  register() {
    console.log(this.user);
    alert('Register button clicked');
  }
}
