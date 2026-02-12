import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventsComponent } from '../events/events.component';
import { AnalyticsComponent } from '../analytics/analytics.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, EventsComponent, AnalyticsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  
  tab: string = 'overview';

 
  totalEvents = 12;
  activeEvents = 3;
  totalRegistrations = 250;
  avgParticipants = 40;

  recentEvents = [
    { name: 'Tech Fest', date: '2026-02-01' },
    { name: 'Cultural Night', date: '2026-02-05' }
  ];


  selectTab(tabName: string) {
    this.tab = tabName;
  }

 
  createEvent() {
    
    alert('Create Event clicked! Show event creation form here.');
  }

  viewRegistrations() {
    
    alert('View Registrations clicked! Show registration list here.');
  }

  exportData() {
    
    alert('Export Event Data clicked! Trigger export logic here.');
  }
}
