import { Component, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-event',
  standalone: true,
  templateUrl: './create-event.html',
  styleUrls: ['./create-event.css'],
   encapsulation: ViewEncapsulation.None 
})
export class CreateEvent {

  constructor(private router: Router) {}

  createEvent() {
    this.router.navigate(['/admin-dashboard']);
  }

  cancel() {
    this.router.navigate(['/admin-dashboard']);
  }
}
