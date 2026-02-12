import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './dashboard/dashboard.component';  

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DashboardComponent],  
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  notifications: string[] = [];
  showNotifications = false;
  title = 'Dashboard';

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  addNotification(message: string) {
    this.notifications.push(message);
  }
}


