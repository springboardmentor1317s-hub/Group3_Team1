import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../auth/auth';

export type StudentHeaderTab = 'dashboard' | 'events' | 'registrations' | 'feedback' | 'profile';
export type StudentHeaderNotificationMode = 'route' | 'dropdown';

export interface StudentHeaderNotification {
  id: string;
  icon: string;
  category: string;
  createdAt: string;
  tone?: string;
  title: string;
  message: string;
}

@Component({
  selector: 'app-student-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-header.component.html',
  styleUrls: ['./student-header.component.css']
})
export class StudentHeaderComponent {
  @Input() activeTab: StudentHeaderTab = 'dashboard';
  @Input() studentName = 'Student';
  @Input() studentPhotoUrl = '';
  @Input() notificationMode: StudentHeaderNotificationMode = 'route';
  @Input() notifications: StudentHeaderNotification[] = [];
  @Input() notificationsLoading = false;
  @Input() notificationsOpen = false;

  @Output() notificationToggle = new EventEmitter<Event | undefined>();

  constructor(
    private router: Router,
    private auth: Auth
  ) {}

  get notificationCount(): number {
    return this.notifications.length;
  }

  get headerInitials(): string {
    const parts = String(this.studentName || 'Student')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return 'ST';
    }

    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  get featuredNotification(): StudentHeaderNotification | null {
    return this.notifications[0] || null;
  }

  get remainingNotifications(): StudentHeaderNotification[] {
    return this.notifications.slice(1);
  }

  navigate(tab: 'dashboard' | 'events' | 'registrations' | 'feedback'): void {
    if (tab === 'dashboard') {
      if (this.activeTab === 'dashboard') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      this.router.navigate(['/new-student-dashboard']);
      return;
    }

    if (tab === 'events') {
      this.router.navigate(['/student-events']);
      return;
    }

    if (tab === 'registrations') {
      this.router.navigate(['/student-registrations']);
      return;
    }

    this.router.navigate(['/student-feedback']);
  }

  openProfile(): void {
    if (this.activeTab === 'profile') {
      return;
    }
    this.router.navigate(['/student-profile']);
  }

  onNotificationClick(event: Event): void {
    if (this.notificationMode === 'dropdown') {
      event.stopPropagation();
      this.notificationToggle.emit(event);
      return;
    }

    this.router.navigate(['/new-student-dashboard'], { fragment: 'notifications-section' });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  trackNotification(_: number, item: StudentHeaderNotification): string {
    return item.id;
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
}
