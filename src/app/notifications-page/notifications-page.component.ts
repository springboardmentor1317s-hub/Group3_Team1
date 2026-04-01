import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../auth/auth';
import { NotificationService, AppNotification } from '../services/notification.service';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, StudentHeaderComponent, AdminCommonHeaderComponent],
  templateUrl: './notifications-page.component.html',
  styleUrls: ['./notifications-page.component.scss']
})
export class NotificationsPageComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  headerNotifications: AppNotification[] = [];
  selectedIds = new Set<string>();
  loading = true;
  actionInProgress = false;
  errorMessage = '';
  page = 1;
  readonly limit = 100;
  total = 0;
  hasMore = false;
  unseenNotificationCount = 0;
  notificationsOpen = false;
  headerLoading = true;
  isStudent = true;
  userName = 'User';
  userPhotoUrl = '';
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

    this.loadHeaderNotifications();
    this.loadAllNotifications();
    this.startRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get allVisibleSelected(): boolean {
    return this.notifications.length > 0 && this.notifications.every((item) => this.selectedIds.has(item.id));
  }

  trackByNotification(_: number, item: AppNotification): string {
    return item.id;
  }

  toggleHeaderNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsOpen = !this.notificationsOpen;
    if (this.notificationsOpen && this.unseenNotificationCount > 0) {
      this.notificationService.markAllSeen().subscribe({
        next: () => {
          this.unseenNotificationCount = 0;
          this.headerNotifications = this.headerNotifications.map((item) => ({ ...item, isSeen: true }));
          this.notifications = this.notifications.map((item) => ({ ...item, isSeen: true }));
        },
        error: () => void 0
      });
    }
  }

  goBackHome(): void {
    this.router.navigate([this.isStudent ? '/new-student-dashboard' : '/admin-dashboard']);
  }

  onViewMoreFromHeader(): void {
    this.notificationsOpen = false;
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      return;
    }
    this.selectedIds.add(id);
  }

  toggleSelectAll(): void {
    if (this.allVisibleSelected) {
      this.selectedIds.clear();
      return;
    }

    this.selectedIds = new Set(this.notifications.map((item) => item.id));
  }

  markSelected(isSeen: boolean): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length || this.actionInProgress) {
      return;
    }

    this.actionInProgress = true;
    this.notificationService.markNotifications(ids, isSeen).pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        const selected = new Set(ids);
        this.notifications = this.notifications.map((item) =>
          selected.has(item.id) ? { ...item, isSeen } : item
        );
        this.headerNotifications = this.headerNotifications.map((item) =>
          selected.has(item.id) ? { ...item, isSeen } : item
        );
        this.selectedIds.clear();
        this.loadHeaderNotifications();
      },
      error: () => {
        this.errorMessage = 'Unable to update notification state right now.';
      }
    });
  }

  deleteNotification(id: string): void {
    if (this.actionInProgress) {
      return;
    }

    this.actionInProgress = true;
    this.notificationService.deleteNotification(id).pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.notifications = this.notifications.filter((item) => item.id !== id);
        this.headerNotifications = this.headerNotifications.filter((item) => item.id !== id);
        this.selectedIds.delete(id);
        this.total = Math.max(0, this.total - 1);
        this.loadHeaderNotifications();
      },
      error: () => {
        this.errorMessage = 'Unable to delete notification right now.';
      }
    });
  }

  toggleSingleSeen(item: AppNotification): void {
    if (!item?.id || this.actionInProgress) {
      return;
    }

    const nextSeenState = !item.isSeen;
    this.actionInProgress = true;
    this.notificationService.markNotifications([item.id], nextSeenState).pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.notifications = this.notifications.map((entry) =>
          entry.id === item.id ? { ...entry, isSeen: nextSeenState } : entry
        );
        this.headerNotifications = this.headerNotifications.map((entry) =>
          entry.id === item.id ? { ...entry, isSeen: nextSeenState } : entry
        );
        this.loadHeaderNotifications();
      },
      error: () => {
        this.errorMessage = 'Unable to update notification state right now.';
      }
    });
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length || this.actionInProgress) {
      return;
    }

    this.actionInProgress = true;
    this.notificationService.deleteNotifications(ids).pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        const selected = new Set(ids);
        this.notifications = this.notifications.filter((item) => !selected.has(item.id));
        this.headerNotifications = this.headerNotifications.filter((item) => !selected.has(item.id));
        this.selectedIds.clear();
        this.total = Math.max(0, this.total - ids.length);
        this.loadHeaderNotifications();
      },
      error: () => {
        this.errorMessage = 'Unable to delete selected notifications right now.';
      }
    });
  }

  deleteAll(): void {
    if (this.actionInProgress) {
      return;
    }

    this.actionInProgress = true;
    this.notificationService.deleteAllNotifications().pipe(
      finalize(() => {
        this.actionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.notifications = [];
        this.headerNotifications = [];
        this.selectedIds.clear();
        this.total = 0;
        this.unseenNotificationCount = 0;
        this.hasMore = false;
      },
      error: () => {
        this.errorMessage = 'Unable to delete all notifications right now.';
      }
    });
  }

  loadMore(): void {
    return;
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

  private loadHeaderNotifications(): void {
    this.headerLoading = true;
    this.notificationService.getDropdownNotifications(15).pipe(
      finalize(() => {
        this.headerLoading = false;
      })
    ).subscribe({
      next: (state) => {
        this.headerNotifications = state.items;
        this.unseenNotificationCount = state.unseenCount;
      },
      error: () => {
        this.headerNotifications = this.notificationService.getCachedDropdownState().items;
        this.unseenNotificationCount = this.notificationService.getCachedDropdownState().unseenCount;
      }
    });
  }

  private loadAllNotifications(): void {
    this.loading = true;
    this.errorMessage = '';
    this.page = 1;
    this.fetchNotificationsPage(1, []);
  }

  private startRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.loadHeaderNotifications();
    }, 12000);
  }

  private fetchNotificationsPage(page: number, collected: AppNotification[]): void {
    this.notificationService.getNotifications({ page, limit: this.limit }).subscribe({
      next: (response) => {
        const merged = [
          ...collected,
          ...response.items.filter((item) => !collected.some((existing) => existing.id === item.id))
        ];

        if (response.hasMore) {
          this.total = response.total;
          this.unseenNotificationCount = response.unseenCount;
          this.hasMore = true;
          this.fetchNotificationsPage(page + 1, merged);
          return;
        }

        this.notifications = merged;
        this.total = response.total;
        this.hasMore = false;
        this.unseenNotificationCount = response.unseenCount;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Unable to load notifications right now.';
      }
    });
  }
}
