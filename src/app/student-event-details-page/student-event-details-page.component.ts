import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { SiteFooterComponent } from '../shared/site-footer/site-footer.component';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { StudentDashboardService, StudentEventCard, StudentEventComment } from '../services/student-dashboard.service';

interface ReplyThreadNode {
  id: string;
  authorId: string;
  name: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
  replies: ReplyThreadNode[];
  replyOpen: boolean;
  replyDraft: string;
  isEditing: boolean;
  editDraft: string;
}

interface PublicCommentView {
  id: string;
  authorId: string;
  name: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
  likes: string[];
  replies: ReplyThreadNode[];
  replyOpen: boolean;
  replyDraft: string;
  isEditing: boolean;
  editDraft: string;
}

@Component({
  selector: 'app-student-event-details-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SiteFooterComponent, StudentHeaderComponent],
  templateUrl: './student-event-details-page.component.html',
  styleUrls: ['./student-event-details-page.component.scss']
})
export class StudentEventDetailsPageComponent implements OnInit, OnDestroy {
  event: StudentEventCard | null = null;
  loading = true;
  commentsLoading = true;
  actionEventId = '';
  errorMessage = '';
  submitError = '';

  feedbackDraftText = '';
  feedbackDraftRating = 0;
  feedbackActionInProgress = false;
  myFeedbackSubmitted = false;
  myFeedbackUpdatedAt = '';
  feedbackEditMode = true;

  publicCommentDraft = '';
  publicCommentActionInProgress = false;
  publicComments: PublicCommentView[] = [];

  private eventId = '';
  private commentsRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private commentsAutoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private commentsLoadedOnce = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private studentDashboardService: StudentDashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.eventId = params.get('id') || '';
      if (!this.eventId) {
        this.errorMessage = 'Event not found.';
        this.loading = false;
        this.commentsLoading = false;
        return;
      }

      this.loadEvent(this.eventId);
      this.loadMyFeedback(this.eventId);
      this.loadPublicComments(this.eventId);
      this.startCommentsAutoRefresh(this.eventId);
    });
  }

  ngOnDestroy(): void {
    if (this.commentsRetryTimer) {
      clearTimeout(this.commentsRetryTimer);
      this.commentsRetryTimer = null;
    }
    if (this.commentsAutoRefreshTimer) {
      clearInterval(this.commentsAutoRefreshTimer);
      this.commentsAutoRefreshTimer = null;
    }
  }

  get studentName(): string {
    return JSON.parse(localStorage.getItem('currentUser') || '{}')?.name || 'Student';
  }

  get profilePhotoUrl(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(
      currentUser.profileImageUrl
      || currentUser.profilePhotoUrl
      || currentUser.avatarUrl
      || currentUser.photoUrl
      || ''
    ).trim();
  }

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.7)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get statusLabel(): string {
    if (!this.event) return 'Open';
    if (this.event.status === 'Registered') return 'Registered';
    if (this.event.status === 'Closed') return 'Closed';
    if (this.event.status === 'Full') return 'Full';
    return 'Open';
  }

  get registrationDeadlineText(): string {
    const event = this.event as (StudentEventCard & Record<string, unknown>) | null;
    if (!event) return 'Not specified';
    const label = typeof event['registrationDeadlineLabel'] === 'string' ? String(event['registrationDeadlineLabel']).trim() : '';
    if (label) return label;

    const rawDate =
      (typeof event['registrationDeadline'] === 'string' ? String(event['registrationDeadline']) : '') ||
      (typeof event['registration_deadline'] === 'string' ? String(event['registration_deadline']) : '') ||
      (typeof event['lastRegistrationDate'] === 'string' ? String(event['lastRegistrationDate']) : '') ||
      (typeof event.endDate === 'string' ? event.endDate : '');

    if (!rawDate) return 'Not specified';
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return 'Not specified';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  get registerDisabled(): boolean {
    if (!this.event) return true;
    return this.event.status !== 'Open' || this.actionEventId === this.event.id;
  }

  get canShowFeedbackPanel(): boolean {
    return this.isEventCompleted();
  }

  get canSubmitFeedback(): boolean {
    if (!this.canShowFeedbackPanel) return false;
    if (this.feedbackActionInProgress) return false;
    return this.feedbackDraftRating > 0 || this.feedbackDraftText.trim().length > 0;
  }

  getCurrentUserAvatarUrl(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const photo = String(
      currentUser.profilePhotoUrl
      || currentUser.profileImage
      || currentUser.avatarUrl
      || currentUser.photoUrl
      || ''
    ).trim();

    if (photo) return photo;
    return this.getDefaultAvatarUrl(this.studentName);
  }

  formatTime(isoValue: string): string {
    const timestamp = new Date(isoValue).getTime();
    if (Number.isNaN(timestamp)) return 'Recently';

    const diffMins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getRegisterLabel(): string {
    if (!this.event) return 'Register Now';
    if (this.event.status === 'Registered') return 'Registered';
    if (this.actionEventId === this.event.id) return 'Joining...';
    if (this.event.status === 'Full') return 'Full';
    if (this.event.status === 'Closed') return 'Closed';
    return 'Register Now';
  }

  registerForEvent(): void {
    if (!this.event || this.registerDisabled) return;
    const currentEventId = this.event.id;

    this.actionEventId = currentEventId;
    this.studentDashboardService.registerForEvent(currentEventId).pipe(
      finalize(() => {
        this.actionEventId = '';
      })
    ).subscribe({
      next: () => {
        this.studentDashboardService.refreshDashboardSnapshot().subscribe({
          next: () => this.loadEvent(currentEventId),
          error: () => this.loadEvent(currentEventId)
        });
      },
      error: (error) => {
        this.errorMessage = error?.error?.error || error?.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  submitMyFeedback(): void {
    if (!this.event || !this.canSubmitFeedback) return;

    this.feedbackActionInProgress = true;
    this.submitError = '';
    const trimmed = this.feedbackDraftText.trim();

    const ratingRequest = this.feedbackDraftRating > 0
      ? this.studentDashboardService.submitEventRating(this.event.id, this.feedbackDraftRating)
      : of(null);
    const feedbackRequest = trimmed
      ? this.studentDashboardService.submitEventFeedback(this.event.id, trimmed)
      : of(null);

    forkJoin([ratingRequest, feedbackRequest]).pipe(
      finalize(() => {
        this.feedbackActionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.feedbackDraftText = trimmed;
        this.myFeedbackSubmitted = this.feedbackDraftRating > 0 || trimmed.length > 0;
        this.myFeedbackUpdatedAt = new Date().toISOString();
        this.feedbackEditMode = false;
      },
      error: (error) => {
        this.submitError = error?.error?.message || 'Failed to submit feedback.';
      }
    });
  }

  deleteMyFeedback(): void {
    if (!this.event) return;
    this.feedbackActionInProgress = true;
    this.submitError = '';

    this.studentDashboardService.deleteMyEventReview(this.event.id).pipe(
      finalize(() => {
        this.feedbackActionInProgress = false;
      })
    ).subscribe({
      next: () => {
        this.feedbackDraftText = '';
        this.feedbackDraftRating = 0;
        this.myFeedbackSubmitted = false;
        this.myFeedbackUpdatedAt = '';
        this.feedbackEditMode = true;
      },
      error: () => {
        this.feedbackDraftText = '';
        this.feedbackDraftRating = 0;
        this.myFeedbackSubmitted = false;
        this.myFeedbackUpdatedAt = '';
        this.feedbackEditMode = true;
      }
    });
  }

  startFeedbackEdit(): void {
    this.feedbackEditMode = true;
  }

  cancelFeedbackEdit(): void {
    if (this.myFeedbackSubmitted) {
      this.feedbackEditMode = false;
      return;
    }
    this.feedbackDraftText = '';
    this.feedbackDraftRating = 0;
  }

  postPublicComment(): void {
    const text = this.publicCommentDraft.trim();
    if (!text || !this.eventId) return;

    const draftBackup = text;
    const optimisticComment: PublicCommentView = {
      id: this.generateTempId(),
      authorId: this.getCurrentUserIdentifier(),
      name: this.studentName,
      avatarUrl: this.getCurrentUserAvatarUrl(),
      text: draftBackup,
      createdAt: new Date().toISOString(),
      likes: [],
      replies: [],
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: draftBackup
    };

    this.publicComments = [optimisticComment, ...this.publicComments];
    this.publicCommentDraft = '';
    this.publicCommentActionInProgress = true;
    this.studentDashboardService.postEventComment(this.eventId, text).pipe(
      finalize(() => {
        this.publicCommentActionInProgress = false;
      })
    ).subscribe({
      next: (created) => {
        const normalized = this.normalizePublicComments([created])[0];
        this.publicComments = this.publicComments.map((item) =>
          item.id === optimisticComment.id ? normalized : item
        );
        this.commentsLoadedOnce = true;
      },
      error: () => {
        this.publicComments = this.publicComments.filter((item) => item.id !== optimisticComment.id);
        this.publicCommentDraft = draftBackup;
      }
    });
  }

  toggleLike(comment: PublicCommentView): void {
    this.studentDashboardService.toggleEventCommentLike(comment.id).subscribe({
      next: (updated) => {
        comment.likes = Array.isArray(updated?.likes) ? updated.likes : [];
      },
      error: () => undefined
    });
  }

  isLikedByMe(comment: PublicCommentView): boolean {
    return comment.likes.includes(this.getCurrentUserIdentifier());
  }

  toggleReplyBox(target: PublicCommentView | ReplyThreadNode): void {
    target.replyOpen = !target.replyOpen;
  }

  postReply(target: PublicCommentView | ReplyThreadNode): void {
    const text = target.replyDraft.trim();
    if (!text || !this.eventId) return;

    const optimisticReply: ReplyThreadNode = {
      id: this.generateTempId(),
      authorId: this.getCurrentUserIdentifier(),
      name: this.studentName,
      avatarUrl: this.getCurrentUserAvatarUrl(),
      text,
      createdAt: new Date().toISOString(),
      replies: [],
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: text
    };

    target.replies = [...target.replies, optimisticReply];
    target.replyDraft = '';
    target.replyOpen = false;

    this.studentDashboardService.postEventComment(this.eventId, text, target.id).subscribe({
      next: () => {
        this.loadPublicComments(this.eventId, true);
      },
      error: () => {
        target.replies = target.replies.filter((reply) => reply.id !== optimisticReply.id);
      }
    });
  }

  canManageEntry(target: PublicCommentView | ReplyThreadNode): boolean {
    return target.authorId === this.getCurrentUserIdentifier();
  }

  startEditEntry(target: PublicCommentView | ReplyThreadNode): void {
    if (!this.canManageEntry(target)) return;
    target.isEditing = true;
    target.editDraft = target.text;
  }

  cancelEditEntry(target: PublicCommentView | ReplyThreadNode): void {
    target.isEditing = false;
    target.editDraft = target.text;
  }

  saveEditEntry(target: PublicCommentView | ReplyThreadNode): void {
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

  deletePublicComment(comment: PublicCommentView): void {
    if (!this.canManageEntry(comment)) return;
    this.studentDashboardService.deleteEventComment(comment.id).subscribe({
      next: () => {
        this.loadPublicComments(this.eventId, true);
      },
      error: () => undefined
    });
  }

  deleteReply(replyId: string): void {
    this.studentDashboardService.deleteEventComment(replyId).subscribe({
      next: () => {
        this.loadPublicComments(this.eventId, true);
      },
      error: () => undefined
    });
  }

  private loadEvent(eventId: string): void {
    this.loading = true;
    this.errorMessage = '';

    const cached = this.studentDashboardService.getCachedEvents().find((item) => item.id === eventId) || null;
    if (cached) {
      this.event = cached;
      this.loading = false;
    }

    this.studentDashboardService.getEvents().subscribe({
      next: (events) => {
        this.event = events.find((item) => item.id === eventId) || null;
        this.loading = false;
        this.loadPublicComments(eventId, true);
        if (!this.event) {
          this.errorMessage = 'Event not found.';
        }
      },
      error: (error) => {
        this.loading = false;
        if (!this.event) {
          this.errorMessage = error?.error?.message || 'Unable to load event details right now.';
        }
      }
    });
  }

  private loadMyFeedback(eventId: string): void {
    this.studentDashboardService.getMyEventReviews([eventId]).subscribe({
      next: (reviews) => {
        const mine = (reviews || [])[0];
        if (!mine) {
          this.myFeedbackSubmitted = false;
          this.feedbackDraftText = '';
          this.feedbackDraftRating = 0;
          this.myFeedbackUpdatedAt = '';
          return;
        }

        this.myFeedbackSubmitted = true;
        this.feedbackDraftText = String(mine.feedback || '');
        this.feedbackDraftRating = Number(mine.rating || 0);
        this.myFeedbackUpdatedAt = mine.updatedAt || mine.createdAt || '';
        this.feedbackEditMode = false;
      },
      error: () => {
        this.myFeedbackSubmitted = false;
        this.feedbackDraftText = '';
        this.feedbackDraftRating = 0;
        this.feedbackEditMode = true;
      }
    });
  }

  private loadPublicComments(eventId: string, silent = false): void {
    if (!silent || this.publicComments.length === 0) {
      this.commentsLoading = true;
    }
    if (this.commentsRetryTimer) {
      clearTimeout(this.commentsRetryTimer);
      this.commentsRetryTimer = null;
    }

    this.studentDashboardService.getEventComments(eventId).pipe(
      finalize(() => {
        this.commentsLoading = false;
      })
    ).subscribe({
      next: (comments) => {
        this.publicComments = this.normalizePublicComments(comments || []);
        this.commentsLoadedOnce = true;
        this.commentsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.commentsLoading = false;
        this.cdr.detectChanges();
        if (!this.commentsLoadedOnce) {
          this.commentsRetryTimer = setTimeout(() => {
            this.loadPublicComments(eventId, true);
          }, 900);
        }
      }
    });
  }

  private startCommentsAutoRefresh(eventId: string): void {
    if (this.commentsAutoRefreshTimer) {
      clearInterval(this.commentsAutoRefreshTimer);
      this.commentsAutoRefreshTimer = null;
    }

    this.commentsAutoRefreshTimer = setInterval(() => {
      if (!eventId) return;
      if (this.hasActiveCommentDrafts()) return;
      this.loadPublicComments(eventId, true);
    }, 5000);
  }

  private hasActiveCommentDrafts(): boolean {
    if (this.publicCommentActionInProgress || this.publicCommentDraft.trim().length > 0) {
      return true;
    }

    const hasActiveThreadDraft = (replies: ReplyThreadNode[]): boolean =>
      replies.some((reply) =>
        reply.replyOpen
        || reply.isEditing
        || reply.replyDraft.trim().length > 0
        || reply.editDraft.trim().length > 0
        || hasActiveThreadDraft(reply.replies)
      );

    return this.publicComments.some((comment) =>
      comment.replyOpen
      || comment.isEditing
      || comment.replyDraft.trim().length > 0
      || comment.editDraft.trim().length > 0
      || hasActiveThreadDraft(comment.replies)
    );
  }

  private generateTempId(): string {
    return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private normalizePublicComments(items: StudentEventComment[]): PublicCommentView[] {
    return (items || []).map((item) => ({
      id: String(item.id),
      authorId: String(item.authorId || '').toLowerCase(),
      name: String(item.name || 'Student'),
      avatarUrl: item.avatarUrl || this.getDefaultAvatarUrl(item.name || 'Student'),
      text: String(item.text || ''),
      createdAt: String(item.createdAt || new Date().toISOString()),
      likes: Array.isArray(item.likes) ? item.likes.filter((id) => typeof id === 'string') : [],
      replies: this.normalizeReplies(item.replies),
      replyOpen: false,
      replyDraft: '',
      isEditing: false,
      editDraft: String(item.text || '')
    }));
  }

  private normalizeReplies(replies: StudentEventComment[] | undefined): ReplyThreadNode[] {
    if (!Array.isArray(replies)) return [];
    return replies
      .filter((reply) =>
        reply
        && typeof reply.id === 'string'
        && typeof reply.name === 'string'
        && typeof reply.avatarUrl === 'string'
        && typeof reply.text === 'string'
        && typeof reply.createdAt === 'string'
      )
      .map((reply) => ({
        id: String(reply.id),
        authorId: String(reply.authorId || '').toLowerCase(),
        name: String(reply.name || 'Student'),
        avatarUrl: reply.avatarUrl || this.getDefaultAvatarUrl(reply.name || 'Student'),
        text: String(reply.text || ''),
        createdAt: String(reply.createdAt || new Date().toISOString()),
        replies: this.normalizeReplies(reply.replies),
        replyOpen: false,
        replyDraft: '',
        isEditing: false,
        editDraft: String(reply.text || '')
      }));
  }

  private isEventCompleted(): boolean {
    if (!this.event) return false;

    const endTimestamp = this.event.endDate ? new Date(this.event.endDate).getTime() : Number.NaN;
    if (!Number.isNaN(endTimestamp)) {
      return endTimestamp < Date.now();
    }

    const startTimestamp = this.event.dateTime ? new Date(this.event.dateTime).getTime() : Number.NaN;
    if (!Number.isNaN(startTimestamp)) {
      return startTimestamp < Date.now();
    }

    return this.event.status === 'Closed';
  }

  private getDefaultAvatarUrl(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&bold=true`;
  }

  private getCurrentUserIdentifier(): string {
    const token = localStorage.getItem('token') || '';
    const tokenParts = token.split('.');
    if (tokenParts.length >= 2) {
      try {
        const payloadJson = atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        const tokenUserId = String(payload?.id || '').trim().toLowerCase();
        if (tokenUserId) return tokenUserId;
      } catch {
        // ignore token parse issue
      }
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(
      currentUser.userId
      || currentUser.id
      || currentUser.email
      || currentUser.name
      || 'student'
    ).toLowerCase();
  }

}
