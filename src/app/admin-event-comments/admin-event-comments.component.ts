import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StudentDashboardService, StudentEventComment } from '../services/student-dashboard.service';
import { EventService, BackendEvent } from '../services/event.service';
import { buildAdminProfileIdentifiers, filterEventsOwnedByAdmin } from '../shared/admin-owned-events.util';

interface AdminCommentView {
  id: string;
  name: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
  replies: AdminCommentView[];
}

@Component({
  selector: 'app-admin-event-comments',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-event-comments.component.html',
  styleUrls: ['./admin-event-comments.component.css']
})
export class AdminEventCommentsComponent implements OnInit, OnDestroy {
  event: BackendEvent | null = null;
  loading = true;
  commentsLoading = true;
  errorMessage = '';
  comments: AdminCommentView[] = [];

  private eventId = '';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly eventService: EventService,
    private readonly studentDashboardService: StudentDashboardService
  ) {}

  ngOnInit(): void {
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
    });
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
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

  trackByCommentId(_index: number, item: AdminCommentView): string {
    return item.id;
  }

  goBack(): void {
    this.router.navigate(['/admin-my-events']);
  }

  private loadEventAndComments(): void {
    this.loading = true;
    this.commentsLoading = true;
    this.errorMessage = '';

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const identifiers = buildAdminProfileIdentifiers({
      userId: currentUser?.userId,
      id: currentUser?.id || currentUser?._id,
      email: currentUser?.email,
      name: currentUser?.name,
      college: currentUser?.college
    });

    this.eventService.fetchEvents().subscribe({
      next: (events) => {
        const ownedEvents = filterEventsOwnedByAdmin(events || [], identifiers);
        const findById = (source: BackendEvent[]) =>
          source.find((item) => String(item.id || (item as BackendEvent & Record<string, unknown>)['_id'] || '') === this.eventId) || null;

        this.event = findById(ownedEvents) || findById(events || []);
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
      },
      error: () => {
        this.comments = [];
        this.commentsLoading = false;
      }
    });
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      if (this.eventId && this.event) {
        this.loadComments();
      }
    }, 6000);
  }

  private normalizeComments(items: StudentEventComment[]): AdminCommentView[] {
    return (items || []).map((item) => ({
      id: String(item.id),
      name: String(item.name || 'Student'),
      avatarUrl: item.avatarUrl || this.getDefaultAvatarUrl(item.name || 'Student'),
      text: String(item.text || ''),
      createdAt: String(item.createdAt || ''),
      replies: this.normalizeComments(item.replies || [])
    }));
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
