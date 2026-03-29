import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../auth/auth';

@Component({
  selector: 'app-super-admin-events',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-events.component.html',
  styleUrls: ['./super-admin-dashboard.css', './super-admin-events.component.css']
})
export class SuperAdminEventsComponent {
  constructor(private auth: Auth, private router: Router) {}

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
