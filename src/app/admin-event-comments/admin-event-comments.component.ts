import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventCommentReplyNotification, StudentDashboardService, StudentEventComment } from '../services/student-dashboard.service';
import { EventService, BackendEvent } from '../services/event.service';
import { AdminCommonHeaderComponent } from '../shared/admin-common-header/admin-common-header.component';
import { Auth } from '../auth/auth';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';

interface AdminCommentView {
  id: string;
  authorId: string;
  name: string;
  authorRole: string;
  authorUserCode: string;
  adminBadgeLabel: string;
  isAdminAuthor: boolean;
  avatarUrl: string;
  text: string;
  createdAt: string;
  likes: string[];
  replies: AdminCommentView[];
  replyOpen: boolean;
  replyDraft: string;
  isEditing: boolean;
  editDraft: string;
}

@Component({
  selector: 'app-admin-event-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AdminCommonHeaderComponent],
  templateUrl: './admin-event-comments.component.html',
  styleUrls: ['./admin-event-comments.component.css']
})
export class AdminEventCommentsComponent implements OnInit, OnDestroy {
  event: BackendEvent | null = null;
  loading = true;
  commentsLoading = true;
  errorMessage = '';
  comments: AdminCommentView[] = [];
  userName = 'College Admin';
  userAvatarUrl: string | null = null;
  notifications: Array<{ id: string; message: string; timeLabel: string; createdAt: string }> = [];
  unreadNotificationCount = 0;
  showNotifications = false;
  publicCommentDraft = '';
  publicCommentActionInProgress = false;
  commentActionError = '';
  replyActionInProgressById: Record<string, boolean> = {};

  private eventId = '';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private notificationRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private currentUserIdentifiers = new Set<string>();
  private readonly profileApiUrl = '/api/profile/me';
  private readonly notificationPollIntervalMs = 8000;
  private notificationSeenStorageKey = 'admin-comment-reply-notifications-last-seen';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly eventService: EventService,
    private readonly studentDashboardService: StudentDashboardService,
    private readonly auth: Auth,
    private readonly cdr: ChangeDetectorRef,
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.userName = currentUser?.name || this.userName;
    this.userAvatarUrl = currentUser?.profileImageUrl || null;
    const notificationUserKey = String(
      currentUser?.id
      || currentUser?._id
      || currentUser?.userId
      || currentUser?.email
      || 'admin'
    ).trim();
    this.notificationSeenStorageKey = `admin-comment-reply-notifications-last-seen-${notificationUserKey}`;
    this.currentUserIdentifiers = new Set(
      [
        currentUser?.id,
        currentUser?._id,
        currentUser?.userId,
        currentUser?.email
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    );
    this.hydrateCurrentUserIdentifiersFromProfile();

    this.route.paramMap.subscribe((params) => {
      this.eventId = String(params.get('id') || '').trim();
      if (!this.eventId) {
        this.errorMessage = 'Event not found.';
        this.loading = false;
        this.commentsLoading = false;
        return;
      }

      this.loadEventAndComments();
      this.startAutoRefresh();
      this.loadNotifications();
      this.startNotificationRefresh();
    });
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.notificationRefreshTimer) {
      clearInterval(this.notificationRefreshTimer);
      this.notificationRefreshTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.showNotifications) return;
    const target = event.target as Node | null;
    const wrapper = this.elementRef.nativeElement.querySelector('.notification-wrapper');
    if (target && wrapper && !wrapper.contains(target)) {
      this.showNotifications = false;
    }
  }

  formatTime(value: string): string {
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return 'Recently';
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDateOnly(value: string): string {
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return 'Date not available';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  get statusLabel(): 'Open' | 'Closed' {
    if (!this.event) return 'Open';
    return this.isEventExpired(this.event) ? 'Closed' : 'Open';
  }

  get cardBackground(): string {
    if (this.event?.posterDataUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.7)), url(${this.event.posterDataUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get registrationDeadlineText(): string {
    const rawDate = String(this.event?.registrationDeadline || '').trim();
    if (!rawDate) return 'Not specified';
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return 'Not specified';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  get eventCreatorName(): string {
    const createdBy = String(this.event?.createdBy || '').trim();
    if (createdBy) {
      return createdBy;
    }

    const organizer = String(this.event?.organizer || '').trim();
    if (organizer) {
      return organizer;
    }

    return 'Campus Event Hub';
  }

  trackByCommentId(_index: number, item: AdminCommentView): string {
    return item.id;
  }

  toggleLike(target: AdminCommentView): void {
    this.studentDashboardService.toggleEventCommentLike(target.id).subscribe({
      next: (updated) => {
        target.likes = Array.isArray(updated?.likes) ? updated.likes.filter((id) => typeof id === 'string') : [];
      },
      error: () => undefined
    });
  }

  isLikedByMe(target: AdminCommentView): boolean {
    const currentUserId = this.getCurrentUserIdentifier();
    return !!currentUserId && target.likes.includes(currentUserId);
  }

  postPublicComment(): void {
    const text = this.publicCommentDraft.trim();
    if (!text || !this.eventId) return;
    this.commentActionError = '';

    const optimisticComment: AdminCommentView = {
      id: this.generateTempId(),
      authorId: this.getCurrentUserIdentifier(),
      name: this.getAdminDisplayName(),
      authorRole: 'college_admin',
      authorUserCode: this.getCurrentUserCode(),
      adminBadgeLabel: 'College Admin',
      isAdminAuthor: true,
      avatarUrl: this.getCurrentUserAvatarUrl(),
      text,
      createdAt: new Date().toISOString(),
      likes: [],
      replies: [],
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: text
    };

    this.comments = [optimisticComment, ...this.comments];
    this.publicCommentDraft = '';
    this.publicCommentActionInProgress = true;

    this.studentDashboardService.postEventComment(this.eventId, text).pipe(
      finalize(() => {
        this.publicCommentActionInProgress = false;
      })
    ).subscribe({
      next: (created) => {
        const normalized = this.normalizeComments([created])[0];
        this.comments = this.comments.map((item) => item.id === optimisticComment.id ? normalized : item);
      },
      error: (error) => {
        this.comments = this.comments.filter((item) => item.id !== optimisticComment.id);
        this.publicCommentDraft = text;
        this.commentActionError = error?.error?.message || 'Unable to post comment right now.';
      }
    });
  }

  toggleReplyBox(target: AdminCommentView): void {
    target.replyOpen = !target.replyOpen;
  }

  postReply(target: AdminCommentView): void {
    const text = target.replyDraft.trim();
    if (!text || !this.eventId) return;
    this.commentActionError = '';
    if (String(target.id || '').startsWith('temp-')) {
      this.commentActionError = 'Please wait a moment and try reply again.';
      return;
    }

    const optimisticReply: AdminCommentView = {
      id: this.generateTempId(),
      authorId: this.getCurrentUserIdentifier(),
      name: this.getAdminDisplayName(),
      authorRole: 'college_admin',
      authorUserCode: this.getCurrentUserCode(),
      adminBadgeLabel: 'College Admin',
      isAdminAuthor: true,
      avatarUrl: this.getCurrentUserAvatarUrl(),
      text,
      createdAt: new Date().toISOString(),
      likes: [],
      replies: [],
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: text
    };

    target.replies = [...target.replies, optimisticReply];
    target.replyDraft = '';
    target.replyOpen = false;
    this.replyActionInProgressById[target.id] = true;

    this.studentDashboardService.postEventComment(this.eventId, text, target.id).pipe(
      finalize(() => {
        delete this.replyActionInProgressById[target.id];
      })
    ).subscribe({
      next: () => this.loadComments(),
      error: (error) => {
        target.replies = target.replies.filter((reply) => reply.id !== optimisticReply.id);
        target.replyOpen = true;
        target.replyDraft = text;
        this.commentActionError = error?.error?.message || 'Unable to post reply right now.';
      }
    });
  }

  isAdminEntry(target: AdminCommentView): boolean {
    if (target.isAdminAuthor === true) {
      return true;
    }

    const role = String(target.authorRole || '').trim().toLowerCase();
    if (role === 'admin' || role === 'college_admin') {
      return true;
    }

    const authorId = String(target.authorId || '').trim().toLowerCase();
    if (authorId && this.currentUserIdentifiers.has(authorId)) {
      return true;
    }

    const normalizedName = String(target.name || '').trim().toLowerCase();
    const currentAdminName = String(this.userName || '').trim().toLowerCase();
    return normalizedName.includes('admin') || (!!currentAdminName && normalizedName === currentAdminName);
  }

  getCommentAuthorDisplayName(target: AdminCommentView): string {
    const rawName = String(target.name || '').trim();
    if (!rawName) {
      return 'Student';
    }

    if (!this.isAdminEntry(target)) {
      return rawName;
    }

    return rawName
      .replace(/^college\s+admin\s*[-:(]?\s*/i, '')
      .replace(/^admin\s*[-:]\s*/i, '')
      .trim() || 'Admin';
  }

  getAdminIdentityLabel(target: AdminCommentView): string {
    if (!this.isAdminEntry(target)) {
      return '';
    }

    const badgeLabel = String(target.adminBadgeLabel || '').trim() || 'College Admin';
    const authorCode = String(target.authorUserCode || '').trim();
    return authorCode ? `${badgeLabel} | ${authorCode}` : badgeLabel;
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.markNotificationsAsRead();
    }
  }

  clearAllNotifications(): void {
    this.notifications = [];
    this.markNotificationsAsRead();
  }

  canManageEntry(target: AdminCommentView): boolean {
    return this.currentUserIdentifiers.has(String(target.authorId || '').trim().toLowerCase());
  }

  startEditEntry(target: AdminCommentView): void {
    if (!this.canManageEntry(target)) return;
    target.isEditing = true;
    target.editDraft = target.text;
  }

  cancelEditEntry(target: AdminCommentView): void {
    target.isEditing = false;
    target.editDraft = target.text;
  }

  saveEditEntry(target: AdminCommentView): void {
    if (!this.canManageEntry(target)) return;
    const nextText = target.editDraft.trim();
    if (!nextText) return;

    const prevText = target.text;
    target.text = nextText;
    target.isEditing = false;
    this.studentDashboardService.updateEventComment(target.id, nextText).subscribe({
      next: () => undefined,
      error: () => {
        target.text = prevText;
      }
    });
  }

  deleteEntry(target: AdminCommentView): void {
    if (!this.canManageEntry(target)) return;
    this.studentDashboardService.deleteEventComment(target.id).subscribe({
      next: () => this.loadComments(),
      error: () => undefined
    });
  }

  goBack(): void {
    this.router.navigate(['/admin-my-events']);
  }

  goToDashboard(): void {
    this.router.navigate(['/admin-dashboard']);
  }

  handleTabChange(tab: 'overview' | 'events' | 'analytics' | 'registrations' | 'feedback' | 'approvedStudents' | 'queries' | 'attendance'): void {
    this.router.navigate(['/admin-dashboard'], { queryParams: { tab } });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private loadEventAndComments(): void {
    this.loading = true;
    this.commentsLoading = true;
    this.errorMessage = '';

    this.eventService.fetchCollegeEvents().subscribe({
      next: (events) => {
        const findById = (source: BackendEvent[]) =>
          source.find((item) => String(item.id || (item as BackendEvent & Record<string, unknown>)['_id'] || '') === this.eventId) || null;

        this.event = findById(events || []);
        this.loading = false;

        if (!this.event) {
          this.commentsLoading = false;
          this.errorMessage = 'This event is not available for your admin account.';
          return;
        }

        this.loadComments();
      },
      error: (error) => {
        this.loading = false;
        this.commentsLoading = false;
        this.errorMessage = error?.error?.message || 'Unable to load event details right now.';
      }
    });
  }

  private loadComments(): void {
    this.commentsLoading = true;
    this.studentDashboardService.getEventComments(this.eventId).subscribe({
      next: (comments) => {
        this.comments = this.normalizeComments(comments || []);
        this.commentsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.comments = [];
        this.commentsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      if (this.eventId && this.event && !this.hasActiveDrafts()) {
        this.loadComments();
      }
    }, 6000);
  }

  private startNotificationRefresh(): void {
    if (this.notificationRefreshTimer) {
      clearInterval(this.notificationRefreshTimer);
      this.notificationRefreshTimer = null;
    }

    this.notificationRefreshTimer = setInterval(() => {
      this.loadNotifications(true);
    }, this.notificationPollIntervalMs);
  }

  private loadNotifications(silent = false): void {
    this.studentDashboardService.getMyCommentReplyNotifications().subscribe({
      next: (items) => {
        this.applyNotifications(items || []);
        this.cdr.detectChanges();
      },
      error: () => {
        if (!silent) {
          this.notifications = [];
          this.unreadNotificationCount = 0;
          this.cdr.detectChanges();
        }
      }
    });
  }

  private applyNotifications(items: EventCommentReplyNotification[]): void {
    this.notifications = (items || [])
      .slice()
      .sort((a, b) => new Date(String(b.createdAt || '')).getTime() - new Date(String(a.createdAt || '')).getTime())
      .map((item) => ({
        id: item.id,
        message: item.message,
        timeLabel: this.formatTime(item.createdAt),
        createdAt: item.createdAt
      }))
      .slice(0, 20);

    this.unreadNotificationCount = this.calculateUnreadNotifications(this.notifications);
  }

  private calculateUnreadNotifications(items: Array<{ createdAt: string }>): number {
    const lastSeenAt = localStorage.getItem(this.notificationSeenStorageKey) || '';
    if (!lastSeenAt) {
      return items.length;
    }

    const lastSeenTime = new Date(lastSeenAt).getTime();
    return items.filter((item) => new Date(String(item.createdAt || '')).getTime() > lastSeenTime).length;
  }

  private markNotificationsAsRead(): void {
    this.unreadNotificationCount = 0;
    const latest = this.notifications
      .map((item) => String(item.createdAt || '').trim())
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    if (latest) {
      localStorage.setItem(this.notificationSeenStorageKey, latest);
    }
  }

  private hasActiveDrafts(): boolean {
    if (this.publicCommentActionInProgress || this.publicCommentDraft.trim().length > 0) {
      return true;
    }

    const hasDraftRecursively = (items: AdminCommentView[]): boolean =>
      items.some((item) =>
        item.replyOpen
        || item.isEditing
        || item.replyDraft.trim().length > 0
        || item.editDraft.trim().length > 0
        || hasDraftRecursively(item.replies || [])
      );

    return hasDraftRecursively(this.comments || []);
  }

  private normalizeComments(items: StudentEventComment[]): AdminCommentView[] {
    return (items || []).map((item) => ({
      id: String(item.id),
      authorId: String(item.authorId || '').trim().toLowerCase(),
      name: String(item.name || 'Student'),
      authorRole: String(item.authorRole || 'student').trim().toLowerCase(),
      authorUserCode: String(item.authorUserCode || '').trim(),
      adminBadgeLabel: String(item.adminBadgeLabel || '').trim(),
      isAdminAuthor: item.isAdminAuthor === true,
      avatarUrl: item.avatarUrl || this.getDefaultAvatarUrl(item.name || 'Student'),
      text: String(item.text || ''),
      createdAt: String(item.createdAt || ''),
      likes: Array.isArray(item.likes) ? item.likes.filter((id) => typeof id === 'string') : [],
      replies: this.normalizeComments(item.replies || []),
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: String(item.text || '')
    }));
  }

  private getCurrentUserIdentifier(): string {
    return Array.from(this.currentUserIdentifiers)[0] || '';
  }

  private getCurrentUserCode(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(currentUser.userId || currentUser.email || '').trim();
  }

  private hydrateCurrentUserIdentifiersFromProfile(): void {
    this.http.get<any>(this.profileApiUrl, { headers: this.authService.getAuthHeaders() }).subscribe({
      next: (profile) => {
        [
          profile?.id,
          profile?._id,
          profile?.userId,
          profile?.email
        ]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
          .forEach((value) => this.currentUserIdentifiers.add(value));
      },
      error: () => undefined
    });
  }

  private getCurrentUserAvatarUrl(): string {
    return this.userAvatarUrl || this.getDefaultAvatarUrl(this.userName);
  }

  private getAdminDisplayName(): string {
    const baseName = String(this.userName || 'College Admin').trim();
    return /^admin\b/i.test(baseName) || baseName.toLowerCase().includes('admin')
      ? baseName
      : `Admin - ${baseName}`;
  }

  private generateTempId(): string {
    return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private isEventExpired(event: BackendEvent): boolean {
    const normalizedStatus = String(event.status || '').toLowerCase();
    if (normalizedStatus === 'past' || normalizedStatus === 'closed' || normalizedStatus === 'completed') {
      return true;
    }

    const parseDate = (value?: string | null): number => {
      if (!value) return Number.NaN;
      const trimmed = String(value).trim();
      if (!trimmed) return Number.NaN;

      const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (ymdMatch) {
        const local = new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]), 23, 59, 59, 999);
        return Number.isNaN(local.getTime()) ? Number.NaN : local.getTime();
      }

      const dmyMatch = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(trimmed);
      if (dmyMatch) {
        const local = new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]), 23, 59, 59, 999);
        return Number.isNaN(local.getTime()) ? Number.NaN : local.getTime();
      }

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return Number.NaN;
      const localDayEnd = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
      return localDayEnd.getTime();
    };

    const endTimestamp = parseDate(event.endDate || null);
    if (!Number.isNaN(endTimestamp)) {
      return endTimestamp < Date.now();
    }

    const eventTimestamp = parseDate(event.dateTime || null);
    if (!Number.isNaN(eventTimestamp)) {
      return eventTimestamp < Date.now();
    }

    return false;
  }

  private getDefaultAvatarUrl(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&bold=true`;
  }
}

