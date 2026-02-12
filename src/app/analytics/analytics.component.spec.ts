import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent {
  totalRegistrations = 250;
  avgParticipants = 40;

  refreshAnalytics() {
    alert('Analytics refreshed! Replace with API call to update data.');
  }
}
