import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

type DashboardTab = 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback';
type SidebarTab = DashboardTab | 'myEvents' | 'none';
type NavItem = {
  key: SidebarTab;
  label: string;
  caption: string;
  icon: string;
  action: 'tab' | 'myEvents';
};

@Component({
  selector: 'app-admin-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard-sidebar.component.html',
  styleUrls: ['./admin-dashboard-sidebar.component.css']
})
export class AdminDashboardSidebarComponent implements OnInit {
  @Input() activeTab: SidebarTab = 'overview';
  @Input() collapsed = false;
  @Output() tabChange = new EventEmitter<DashboardTab>();
  @Output() createEvent = new EventEmitter<void>();
  @Output() myEvents = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();

  private readonly storageKey = 'admin-sidebar-collapsed';

  readonly primaryNavItems: NavItem[] = [
    {
      key: 'overview',
      label: 'Dashboard',
      caption: 'Overview and highlights',
      icon: 'space_dashboard',
      action: 'tab'
    },
    {
      key: 'events',
      label: 'Manage Events',
      caption: 'Create, edit, and control events',
      icon: 'event',
      action: 'tab'
    },
    {
      key: 'myEvents',
      label: 'My Events',
      caption: 'View your live event cards',
      icon: 'view_carousel',
      action: 'myEvents'
    }
  ];
  readonly secondaryNavItems: NavItem[] = [
    {
      key: 'registrations',
      label: 'Registrations',
      caption: 'Track student approvals',
      icon: 'fact_check',
      action: 'tab'
    },
    {
      key: 'feedback',
      label: 'Feedback',
      caption: 'Review student responses',
      icon: 'forum',
      action: 'tab'
    },
    {
      key: 'analytics',
      label: 'Analytics',
      caption: 'Monitor performance trends',
      icon: 'insights',
      action: 'tab'
    }
  ];

  ngOnInit(): void {
    const savedState = localStorage.getItem(this.storageKey);
    if (savedState !== null) {
      this.collapsed = savedState === 'true';
    }

    this.collapsedChange.emit(this.collapsed);
  }

  setTab(tab: DashboardTab): void {
    this.tabChange.emit(tab);
  }

  triggerNav(item: NavItem): void {
    if (item.action === 'myEvents') {
      this.myEvents.emit();
      return;
    }

    this.setTab(item.key as DashboardTab);
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    localStorage.setItem(this.storageKey, String(this.collapsed));
    this.collapsedChange.emit(this.collapsed);
  }
}
