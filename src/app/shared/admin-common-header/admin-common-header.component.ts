import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

export type AdminHeaderTab = 'overview' | 'events' | 'registrations' | 'none';

export interface AdminHeaderNotification {
  id: string;
  message: string;
  timeLabel: string;
}

@Component({
  selector: 'app-admin-common-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-common-header.component.html',
  styleUrls: ['./admin-common-header.component.css']
})
export class AdminCommonHeaderComponent {
  @ViewChild('headerSearchInput') private headerSearchInput?: ElementRef<HTMLInputElement>;

  @Input() activeTab: AdminHeaderTab = 'none';
  @Input() userName = 'College Admin';
  @Input() userAvatarUrl: string | null = null;
  @Input() searchQuery = '';
  @Input() searchPlaceholder = 'Search events or registrations...';
  @Input() showSearch = true;
  @Input() showNotifications = true;
  @Input() showExport = true;
  @Input() showProfileLink = true;
  @Input() showLogout = true;
  @Input() unreadNotificationCount = 0;
  @Input() notificationsOpen = false;
  @Input() notifications: AdminHeaderNotification[] = [];

  @Output() activeTabChange = new EventEmitter<Exclude<AdminHeaderTab, 'none'>>();
  @Output() brandClick = new EventEmitter<void>();
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() searchTriggered = new EventEmitter<void>();
  @Output() notificationsTriggered = new EventEmitter<void>();
  @Output() clearNotifications = new EventEmitter<void>();
  @Output() exportTriggered = new EventEmitter<void>();
  @Output() logoutTriggered = new EventEmitter<void>();

  setTab(tab: Exclude<AdminHeaderTab, 'none'>): void {
    this.activeTabChange.emit(tab);
  }

  onSearchQueryChange(value: string): void {
    this.searchQueryChange.emit(value);
  }

  triggerSearch(): void {
    const input = this.headerSearchInput?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    }
    this.searchTriggered.emit();
  }

  get avatarText(): string {
    const name = (this.userName || '').trim();
    if (!name) return 'U';
    return (name.split(/\s+/)[0] || 'U').charAt(0).toUpperCase();
  }
}
