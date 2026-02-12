import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventsComponent } from '../events/events.component';
import { AnalyticsComponent } from '../analytics/analytics.component';
import { EventService } from '../event.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, EventsComponent, AnalyticsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  tab: string = 'overview';
  totalEvents = 0;
  activeEvents = 0;
  totalRegistrations = 0;
  avgParticipants = 0;
  recentEvents: any[] = [];

  notifications: string[] = [];
  showNotifications = false;

  constructor(private eventService: EventService) {}

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  selectTab(tabName: string) {
    this.tab = tabName;
    if (tabName === 'overview') {
      this.updateMetrics(this.eventService.getEvents());
    }
  }

  createEvent() {
    this.tab = 'events';
    this.notifications.push('Opening event creation form...');
  }

  viewRegistrations() {
    this.tab = 'analytics';
    this.notifications.push('Viewing all registrations...');
  }

  exportData() {
    const events = this.eventService.getEvents();

    if (events.length === 0) {
      this.notifications.push('No events available to export.');
      return;
    }

    const rows = events.map(e =>
      `${e.name},${e.date},${e.location},${e.organizer},${e.contact},${e.description}`
    );

    const csvContent = "data:text/csv;charset=utf-8,"
      + ["Name,Date,Location,Organizer,Contact,Description", ...rows].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "all_events.csv");
    document.body.appendChild(link);
    link.click();

    this.notifications.push('All events exported as CSV!');
  }

  updateMetrics(events: any[]) {
    this.totalEvents = events.length;
    this.activeEvents = events.filter(e => new Date(e.date) >= new Date()).length;
    this.recentEvents = events.slice(-3);
    this.notifications.push('Event metrics updated.');
  }
}
