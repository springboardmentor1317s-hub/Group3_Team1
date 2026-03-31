import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { AppNotification, NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-notification-inbox-page',
  standalone: true,
  imports: [CommonModule, StudentHeaderComponent, AdminCommonHeaderComponent],
  templateUrl: './notification-inbox-page.component.html',
  styleUrls: ['./notification-inbox-page.component.scss']
})
export class NotificationInboxPageComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  headerNotifications: AppNotification[] = [];
  loading = true;
  headerLoading = true;
  actionInProgress = false;
  errorMessage = '';
  unseenNotificationCount = 0;
  notificationsOpen = false;
  isStudent = true;
  userName = 'User';
  userPhotoUrl = '';
  deletingIds = new Set<string>();
  markingSeenIds = new Set<string>();
  private inboxCacheKey = 'notification-inbox-cache';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly auth: Auth
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const role = String(currentUser?.role || localStorage.getItem('role') || 'student').toLowerCase();
    this.isStudent = role === 'student';
    this.userName = String(currentUser?.name || (this.isStudent ? 'Student' : 'College Admin'));
    this.userPhotoUrl = String(
      currentUser?.profileImageUrl
      || currentUser?.profilePhotoUrl
      || currentUser?.avatarUrl
      || currentUser?.photoUrl
      || ''
    ).trim();
    this.inboxCacheKey = this.buildInboxCacheKey(currentUser, role);

    this.prefillInboxFromCache();
    this.loadHeaderNotifications();
    this.loadInboxNotifications();
    this.startRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  trackByNotification(_: number, item: AppNotification): string {
    return item.id;
  }

  toggleHeaderNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsOpen = !this.notificationsOpen;
  }

  goBackHome(): void {
    this.router.navigate([this.isStudent ? '/new-student-dashboard' : '/admin-dashboard']);
  }

  closeHeaderDropdown(): void {
    this.notificationsOpen = false;
  }

  onAdminHeaderTabChange(tab: 'overview' | 'events' | 'registrations'): void {
    if (tab === 'overview') {
      this.router.navigate(['/admin-dashboard']);
      return;
    }

    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  isDeleting(id: string): boolean {
    return this.deletingIds.has(String(id));
  }

  isMarkingSeen(id: string): boolean {
    return this.markingSeenIds.has(String(id));
  }

  markAsSeen(id: string): void {
    if (!id || this.isMarkingSeen(id)) {
      return;
    }

    this.markingSeenIds.add(String(id));
    this.notifications = this.notifications.map((item) =>
      item.id === id ? { ...item, isSeen: true } : item
    );
    this.syncHeaderAndCounts();
    this.notificationService.markNotifications([id], true).pipe(
      finalize(() => {
        this.markingSeenIds.delete(String(id));
      })
    ).subscribe({
      next: () => {
        this.persistInboxCache();
        this.loadHeaderNotifications(true);
      },
      error: () => {
        this.notifications = this.notifications.map((item) =>
          item.id === id ? { ...item, isSeen: false } : item
        );
        this.syncHeaderAndCounts();
        this.errorMessage = 'Unable to mark this notification as seen right now.';
      }
    });
  }

  deleteNotification(id: string): void {
    if (!id || this.isDeleting(id)) {
      return;
    }

    const targetId = String(id);
    const previousNotifications = [...this.notifications];
    this.deletingIds.add(targetId);
    this.notifications = this.notifications.filter((item) => item.id !== targetId);
    this.syncHeaderAndCounts();
    this.notificationService.deleteNotification(id).pipe(
      finalize(() => {
        this.deletingIds.delete(targetId);
      })
    ).subscribe({
      next: () => {
        this.persistInboxCache();
        this.loadHeaderNotifications(true);
      },
      error: () => {
        this.notifications = previousNotifications;
        this.syncHeaderAndCounts();
        this.errorMessage = 'Unable to delete notification right now.';
      }
    });
  }

  clearAll(): void {
    if (this.actionInProgress || this.notifications.length === 0) {
      return;
    }

    const previousNotifications = [...this.notifications];
    this.actionInProgress = true;
    this.notifications = [];
    this.syncHeaderAndCounts();
    this.notificationService.deleteAllNotifications().pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.persistInboxCache();
        this.loadHeaderNotifications(true);
      },
      error: () => {
        this.notifications = previousNotifications;
        this.syncHeaderAndCounts();
        this.errorMessage = 'Unable to clear notifications right now.';
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  formatTime(value: string): string {
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

  private loadHeaderNotifications(silent = false): void {
    if (!silent) {
      this.headerLoading = true;
    }
    this.notificationService.getDropdownNotifications(7).pipe(
      finalize(() => {
        this.headerLoading = false;
      })
    ).subscribe({
      next: (state) => {
        this.headerNotifications = state.items;
        this.unseenNotificationCount = state.unseenCount;
      },
      error: () => {
        const cachedState = this.notificationService.getCachedDropdownState();
        this.headerNotifications = cachedState.items;
        this.unseenNotificationCount = cachedState.unseenCount;
      }
    });
  }

  private loadInboxNotifications(silent = false): void {
    if (!silent && this.notifications.length === 0) {
      this.loading = true;
    }
    this.errorMessage = '';
    this.notificationService.getNotifications({ page: 1, limit: 100 }).subscribe({
      next: (response) => {
        this.notifications = response.items;
        this.unseenNotificationCount = response.unseenCount;
        this.syncHeaderAndCounts();
        this.persistInboxCache();
        this.loading = false;
        if (response.hasMore) {
          this.fetchRemainingNotifications(response.page + 1, response.limit);
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Unable to load notifications right now.';
      }
    });
  }

  private startRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.loadHeaderNotifications(true);
      this.loadInboxNotifications(true);
    }, 12000);
  }

  private prefillInboxFromCache(): void {
    try {
      const raw = localStorage.getItem(this.inboxCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: AppNotification[]; unseenCount?: number };
        if (Array.isArray(parsed?.items)) {
          this.notifications = parsed.items;
          this.unseenNotificationCount = Number(parsed?.unseenCount || 0);
          this.syncHeaderAndCounts();
          this.loading = false;
          return;
        }
      }
    } catch {
      // Fall back to the warm dropdown cache so the inbox opens instantly.
    }

    const dropdownState = this.notificationService.getCachedDropdownState();
    if (dropdownState.items.length > 0) {
      this.notifications = dropdownState.items;
      this.unseenNotificationCount = Number(dropdownState.unseenCount || 0);
      this.syncHeaderAndCounts();
      this.loading = false;
    }
  }

  private persistInboxCache(): void {
    try {
      localStorage.setItem(this.inboxCacheKey, JSON.stringify({
        items: this.notifications,
        unseenCount: this.unseenNotificationCount
      }));
    } catch {
      return;
    }
  }

  private syncHeaderAndCounts(): void {
    const unseenItems = this.notifications.filter((item) => !item.isSeen);
    this.unseenNotificationCount = unseenItems.length;
    this.headerNotifications = this.notifications.slice(0, 7);
    this.persistInboxCache();
  }

  private fetchRemainingNotifications(page: number, limit: number): void {
    this.notificationService.getNotifications({ page, limit }).subscribe({
      next: (response) => {
        const existingIds = new Set(this.notifications.map((item) => item.id));
        const nextItems = (response.items || []).filter((item) => !existingIds.has(item.id));
        if (nextItems.length > 0) {
          this.notifications = [...this.notifications, ...nextItems];
          this.syncHeaderAndCounts();
        }

        if (response.hasMore) {
          this.fetchRemainingNotifications(response.page + 1, response.limit);
        }
      },
      error: () => void 0
    });
  }

  private buildInboxCacheKey(currentUser: Record<string, unknown>, role: string): string {
    const userKey = String(
      currentUser?.['userId']
      || currentUser?.['id']
      || currentUser?.['_id']
      || currentUser?.['email']
      || role
      || 'default'
    ).trim();

    return `notification-inbox-cache:${userKey}`;
  }
}
