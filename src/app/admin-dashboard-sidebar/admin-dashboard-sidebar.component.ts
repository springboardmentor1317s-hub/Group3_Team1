import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback';

@Component({
  selector: 'app-admin-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard-sidebar.component.html',
  styleUrls: ['./admin-dashboard-sidebar.component.css']
})
export class AdminDashboardSidebarComponent {
  @Input() activeTab: DashboardTab = 'overview';
  @Output() tabChange = new EventEmitter<DashboardTab>();
  @Output() createEvent = new EventEmitter<void>();
  @Output() myEvents = new EventEmitter<void>();

  setTab(tab: DashboardTab): void {
    this.tabChange.emit(tab);
  }
}
