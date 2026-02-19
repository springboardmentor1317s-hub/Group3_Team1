import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
<<<<<<< HEAD
import { RouterLink } from "@angular/router";
=======
import { RouterLink, Router } from '@angular/router';
>>>>>>> f02281b (create button and form)

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard {

  // 🔹 Milestone-2 data
  totalEvents = 4;
  activeUsers = 1234;
  totalRegistrations = 0;
  pendingReviews = 0;

  // 🔹 Events list (dummy – Milestone-2)
  events = [
    {
      title: 'Inter-College Hackathon 2024',
      college: 'tech-university',
      participants: 127,
      category: 'hackathon'
    },
    {
      title: 'Cultural Fest – Harmony 2024',
      college: 'arts-college',
      participants: 342,
      category: 'cultural'
    },
    {
      title: 'Basketball Championship',
      college: 'sports-university',
      participants: 160,
      category: 'sports'
    },
    {
      title: 'Web Development Workshop',
      college: 'tech-university',
      participants: 65,
      category: 'workshop'
    }
  ];

  constructor(private router: Router) {}

  // 🔹 New button action
  goToCreateEvent() {
    this.router.navigate(['/create-event']);
  }
}
