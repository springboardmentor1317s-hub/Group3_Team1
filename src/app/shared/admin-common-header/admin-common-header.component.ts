import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

export type AdminHeaderTab = 'overview' | 'events' | 'registrations' | 'none';

export interface AdminHeaderNotification {
  id: string;
  message: string;
  createdAt: string;
  title?: string;
  icon?: string;
  category?: string;
  tone?: string;
  isSeen?: boolean;
  timeLabel?: string;
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
  @Input() notificationsLoading = false;
  @Input() notificationsOpen = false;
  @Input() notifications: AdminHeaderNotification[] = [];
  @Input() showViewMore = false;

  @Output() activeTabChange = new EventEmitter<Exclude<AdminHeaderTab, 'none'>>();
  @Output() brandClick = new EventEmitter<void>();
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() searchTriggered = new EventEmitter<void>();
  @Output() notificationsTriggered = new EventEmitter<void>();
  @Output() clearNotifications = new EventEmitter<void>();
  @Output() viewMoreNotifications = new EventEmitter<void>();
  @Output() notificationDelete = new EventEmitter<string>();
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

  get notificationCount(): number {
    return this.notifications.length;
  }

  get featuredNotification(): AdminHeaderNotification | null {
    return this.notifications[0] || null;
  }

  get remainingNotifications(): AdminHeaderNotification[] {
    return this.notifications.slice(1);
  }

  formatNotificationTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Just now';
    }

    const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  onDeleteNotification(event: Event, id: string): void {
    event.stopPropagation();
    if (!id) {
      return;
    }
    this.notificationDelete.emit(id);
  }
}
