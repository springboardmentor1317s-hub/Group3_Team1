import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, timeout } from 'rxjs';
import { StudentHeaderComponent } from '../shared/student-header/student-header.component';
import { EventCommentReplyNotification, StudentDashboardService, StudentEventCard, StudentEventComment, StudentNotificationItem, StudentRegistrationRecord } from '../services/student-dashboard.service';
import { EventService } from '../services/event.service';
import { PaymentService, PaymentStatus } from '../services/payment.service';
import { AttendanceService, CertificateStatusResponse } from '../services/attendance.service';
import { NotificationService } from '../services/notification.service';

interface ReplyThreadNode {
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
  authorRole: string;
  authorUserCode: string;
  adminBadgeLabel: string;
  isAdminAuthor: boolean;
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
  imports: [CommonModule, FormsModule, RouterModule, StudentHeaderComponent],
  templateUrl: './student-event-details-page.component.html',
  styleUrls: ['./student-event-details-page.component.scss']
})
export class StudentEventDetailsPageComponent implements OnInit, OnDestroy {
  private static readonly FALLBACK_DESCRIPTION = 'Explore this campus experience and secure your seat before registrations close.';
  event: StudentEventCard | null = null;
  currentRegistration: StudentRegistrationRecord | null = null;
  loading = true;
  registrationStateLoading = true;
  commentsLoading = true;
  notificationsLoading = true;
  notificationsDropdownOpen = false;
  unseenNotificationCount = 0;
  showNotificationViewMore = false;
  actionEventId = '';
  errorMessage = '';
  submitError = '';
  paymentStatus: PaymentStatus | null = null;
  paymentStatusLoading = false;
  receiptDownloading = false;
  admitCardActionInProgress = false;
  admitCardError = '';
  certificateStatus: CertificateStatusResponse | null = null;
  certificateStatusLoading = false;
  certificateActionInProgress = false;
  certificateError = '';

  feedbackDraftText = '';
  feedbackDraftRating = 0;
  feedbackActionInProgress = false;
  myFeedbackSubmitted = false;
  myFeedbackUpdatedAt = '';
  feedbackEditMode = true;

  publicCommentDraft = '';
  publicCommentActionInProgress = false;
  publicComments: PublicCommentView[] = [];
  notifications: StudentNotificationItem[] = [];

  private eventId = '';
  private commentsRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private commentsAutoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private notificationsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private commentsLoadedOnce = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private studentDashboardService: StudentDashboardService,
    private cdr: ChangeDetectorRef,
    private eventService: EventService,
    private paymentService: PaymentService,
    private attendanceService: AttendanceService,
    private notificationService: NotificationService
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

      this.applyEventFromNavigationState(this.eventId);
      this.loadEvent(this.eventId);
      this.loadMyFeedback(this.eventId);
      this.loadPublicComments(this.eventId);
      this.startCommentsAutoRefresh(this.eventId);
      this.loadNotifications();
      this.startNotificationsRefresh();
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
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
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

  get profileInitials(): string {
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

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.7)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

  get statusLabel(): string {
    if (!this.event) return 'Open';
    if (this.isEventExpired(this.event)) return 'Closed';

    if (this.currentRegistration?.status === 'APPROVED') return 'Approved';
    if (this.currentRegistration?.status === 'PENDING') return 'Pending Review';
    if (this.currentRegistration?.status === 'REJECTED') return 'Rejected';

    const normalizedStatus = String(this.event.status || '').toLowerCase();
    if (normalizedStatus === 'registered') return 'Registered';
    if (normalizedStatus === 'closed') return 'Closed';
    if (normalizedStatus === 'full') return 'Full';
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

  get eventDescriptionText(): string {
    const text = String(this.event?.description || '').trim();
    if (text) {
      return text;
    }
    return 'Event description is not available right now.';
  }

  get registerDisabled(): boolean {
    if (!this.event) return true;
    if (this.registrationStateLoading) return true;
    if (this.isEventExpired(this.event) || this.actionEventId === this.event.id) return true;
    if (this.currentRegistration?.status === 'APPROVED' || this.currentRegistration?.status === 'PENDING') return true;
    return this.event.status !== 'Open' && this.currentRegistration?.status !== 'REJECTED';
  }

  get canShowFeedbackPanel(): boolean {
    return this.isEventCompleted();
  }

  get paymentStatusLabel(): string {
    if (!this.event?.isPaid) return 'Not Required';
    if (this.paymentStatusLoading) return 'Checking...';
    return this.paymentStatus?.status || 'PENDING';
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
    if (this.isEventExpired(this.event)) return 'Closed';
    if (this.registrationStateLoading) return 'Checking Status...';

    if (this.currentRegistration?.status === 'APPROVED') return 'Approved';
    if (this.currentRegistration?.status === 'PENDING') return 'Under Review';
    if (this.currentRegistration?.status === 'REJECTED') return 'Update And Resubmit';

    const normalizedStatus = String(this.event.status || '').toLowerCase();
    if (normalizedStatus === 'registered') return 'Registered';
    if (this.actionEventId === this.event.id) return 'Joining...';
    if (normalizedStatus === 'full') return 'Full';
    if (normalizedStatus === 'closed') return 'Closed';
    return 'Register Now';
  }

  canDeleteCurrentRegistration(): boolean {
    if (this.registrationStateLoading || !this.currentRegistration) {
      return false;
    }
    return this.currentRegistration.status === 'PENDING' || this.currentRegistration.status === 'REJECTED';
  }

  canDownloadAdmitCard(): boolean {
    if (this.registrationStateLoading || !this.currentRegistration || !this.event) {
      return false;
    }
    return this.currentRegistration.status === 'APPROVED';
  }

  openNotifications(event?: Event): void {
    event?.stopPropagation();
    this.notificationsDropdownOpen = !this.notificationsDropdownOpen;
    if (this.notificationsDropdownOpen) {
      this.markAllNotificationsSeen();
    }
  }

  openNotificationsPage(): void {
    this.notificationsDropdownOpen = false;
    this.router.navigate(['/student-notifications']);
  }

  canDownloadCertificate(): boolean {
    if (this.registrationStateLoading || !this.currentRegistration || !this.event) {
      return false;
    }
    return this.currentRegistration.status === 'APPROVED' && Boolean(this.certificateStatus?.canDownload);
  }

  downloadAdmitCard(): void {
    const eventId = this.event?.id || '';
    if (!eventId || !this.canDownloadAdmitCard() || this.admitCardActionInProgress) {
      return;
    }

    this.admitCardActionInProgress = true;
    this.admitCardError = '';

    this.attendanceService.downloadAdmitCard(eventId).pipe(
      finalize(() => {
        this.admitCardActionInProgress = false;
      })
    ).subscribe({
      next: (blob) => {
        const safeName = String(this.event?.title || 'event').replace(/[^a-z0-9]+/gi, '_');
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `admit_card_${safeName}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      },
      error: (error) => {
        this.admitCardError = error?.error?.message || 'Admit card is not generated yet by admin.';
      }
    });
  }

  downloadCertificate(): void {
    const eventId = this.event?.id || '';
    if (!eventId || !this.canDownloadCertificate() || this.certificateActionInProgress) {
      return;
    }

    this.certificateActionInProgress = true;
    this.certificateError = '';

    this.attendanceService.downloadCertificate(eventId).pipe(
      finalize(() => {
        this.certificateActionInProgress = false;
      })
    ).subscribe({
      next: (blob) => {
        const safeName = String(this.event?.title || 'event').replace(/[^a-z0-9]+/gi, '_');
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `certificate_${safeName}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      },
      error: (error) => {
        this.certificateError = error?.error?.message || 'Certificate is available only for students marked present.';
      }
    });
  }

  registerForEvent(): void {
    if (!this.event || this.registerDisabled) return;
    this.router.navigate(['/student-event-registration', this.event.id], {
      state: {
        event: this.event,
        registration: this.currentRegistration
      }
    });
  }

  deleteCurrentRegistration(): void {
    const registration = this.currentRegistration;
    const eventId = this.event?.id || '';
    if (!registration || !eventId || !this.canDeleteCurrentRegistration() || this.actionEventId === eventId) {
      return;
    }

    const shouldDelete = window.confirm(
      registration.status === 'REJECTED'
        ? 'Are you sure you want to delete this rejected registration?'
        : 'Are you sure you want to delete this pending registration?'
    );
    if (!shouldDelete) {
      return;
    }

    this.actionEventId = eventId;
    this.errorMessage = '';
    this.studentDashboardService.applyOptimisticCancellation(registration);

    this.studentDashboardService.cancelRegistration(eventId).pipe(
      finalize(() => {
        this.actionEventId = '';
      })
    ).subscribe({
      next: () => {
        this.currentRegistration = null;
        this.registrationStateLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to delete registration right now.';
        this.studentDashboardService.fetchLatestRegistrations().pipe(
          timeout(12000)
        ).subscribe({
          next: (registrations) => {
            this.currentRegistration = registrations.find((item) => item.eventId === eventId) || null;
            this.registrationStateLoading = false;
            this.cdr.detectChanges();
          },
          error: () => {
            this.registrationStateLoading = false;
            this.cdr.detectChanges();
          }
        });
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
      authorRole: 'student',
      authorUserCode: this.getCurrentUserCode(),
      adminBadgeLabel: '',
      isAdminAuthor: false,
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
      authorRole: 'student',
      authorUserCode: this.getCurrentUserCode(),
      adminBadgeLabel: '',
      isAdminAuthor: false,
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

  isAdminEntry(target: PublicCommentView | ReplyThreadNode): boolean {
    if (target.isAdminAuthor === true) {
      return true;
    }

    const role = String(target.authorRole || '').trim().toLowerCase();
    if (role === 'admin' || role === 'college_admin') {
      return true;
    }

    const name = String(target.name || '').trim().toLowerCase();
    if (!name) return false;
    return name.startsWith('admin') || name.includes('admin -') || name.includes('admin');
  }

  getCommentAuthorDisplayName(target: PublicCommentView | ReplyThreadNode): string {
    const rawName = String(target.name || '').trim();
    if (!rawName) {
      return 'Student';
    }

    if (!this.isAdminEntry(target)) {
      return rawName;
    }

    const normalized = rawName
      .replace(/^college\s+admin\s*\((.*)\)$/i, '$1')
      .replace(/^admin\s*[-:]\s*/i, '')
      .replace(/^admin\s+/i, '')
      .trim();

    if (!normalized) {
      return 'Admin';
    }

    return normalized;
  }

  getAdminIdentityLabel(target: PublicCommentView | ReplyThreadNode): string {
    if (!this.isAdminEntry(target)) {
      return '';
    }

    const badgeLabel = String(target.adminBadgeLabel || '').trim() || 'College Admin';
    const authorCode = String(target.authorUserCode || '').trim();
    return authorCode ? `${badgeLabel} • ${authorCode}` : badgeLabel;
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

  refreshPaymentStatus(): void {
    if (!this.event?.id) {
      return;
    }
    this.loadPaymentStatus(this.event.id);
  }

  downloadReceipt(): void {
    if (!this.paymentStatus?.id || this.receiptDownloading) {
      return;
    }

    this.receiptDownloading = true;
    this.paymentService.downloadReceipt(this.paymentStatus.id).pipe(
      finalize(() => {
        this.receiptDownloading = false;
      })
    ).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `receipt-${this.paymentStatus?.paymentId || 'payment'}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        this.errorMessage = error?.error?.error || error?.error?.message || 'Unable to download the receipt right now.';
      }
    });
  }

  private loadEvent(eventId: string): void {
    this.loading = true;
    this.registrationStateLoading = true;
    this.errorMessage = '';

    const cached = this.studentDashboardService.getCachedEvents().find((item) => item.id === eventId) || null;
    const cachedRegistration = this.studentDashboardService.getCachedRegistrations().find((item) => item.eventId === eventId) || null;
    if (cached) {
      this.event = cached;
      this.loading = false;
    }
    if (cachedRegistration) {
      this.currentRegistration = cachedRegistration;
      this.registrationStateLoading = false;
    }

    this.studentDashboardService.fetchLatestRegistrations().pipe(
      timeout(12000)
    ).subscribe({
      next: (registrations) => {
        this.currentRegistration = registrations.find((item) => item.eventId === eventId) || null;
        this.registrationStateLoading = false;
        this.loadPaymentStatus(eventId);
        this.loadCertificateStatus(eventId);
        this.cdr.detectChanges();
      },
      error: () => {
        this.currentRegistration = this.studentDashboardService.getCachedRegistrations().find((item) => item.eventId === eventId) || null;
        this.registrationStateLoading = false;
        this.loadPaymentStatus(eventId);
        this.loadCertificateStatus(eventId);
        this.cdr.detectChanges();
      }
    });

    this.studentDashboardService.getEvents().pipe(
      timeout(9000)
    ).subscribe({
      next: (events) => {
        const fetchedEvent = events.find((item) => item.id === eventId) || null;
        this.event = this.mergePreferredEventData(this.event, fetchedEvent);
        this.loading = false;
        this.loadPublicComments(eventId, true);
        if (!this.event) {
          this.loadEventFromDirectSource(eventId);
          return;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadEventFromDirectSource(eventId);
      }
    });
  }

  private loadEventFromDirectSource(eventId: string): void {
    this.eventService.fetchEvents().pipe(
      timeout(9000)
    ).subscribe({
      next: (events) => {
        const directEvent = (events || [])
          .map((item) => this.eventService.convertToFrontendEvent(item) as StudentEventCard)
          .find((item) => String(item.id) === eventId) || null;
        this.event = this.mergePreferredEventData(this.event, directEvent);
        this.loading = false;
        this.loadPublicComments(eventId, true);
        if (!this.event) {
          this.errorMessage = 'Event not found.';
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.loadPublicComments(eventId, true);
        if (!this.event) {
          this.errorMessage = error?.error?.message || 'Unable to load event details right now.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  private loadPaymentStatus(eventId: string): void {
    const targetEvent = this.event || this.studentDashboardService.getCachedEvents().find((item) => item.id === eventId) || null;
    if (!targetEvent?.isPaid) {
      this.paymentStatus = null;
      this.paymentStatusLoading = false;
      return;
    }

    this.paymentStatusLoading = true;
    this.paymentService.getPaymentStatus(eventId).pipe(
      finalize(() => {
        this.paymentStatusLoading = false;
      })
    ).subscribe({
      next: (status) => {
        this.paymentStatus = status;
      },
      error: () => {
        this.paymentStatus = null;
      }
    });
  }

  private loadCertificateStatus(eventId: string): void {
    const registration = this.currentRegistration;
    if (!registration || registration.status !== 'APPROVED') {
      this.certificateStatus = null;
      this.certificateStatusLoading = false;
      return;
    }

    this.certificateStatusLoading = true;
    this.attendanceService.getMyCertificateStatus(eventId).pipe(
      finalize(() => {
        this.certificateStatusLoading = false;
      })
    ).subscribe({
      next: (status) => {
        this.certificateStatus = status;
      },
      error: () => {
        this.certificateStatus = null;
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

  private loadNotifications(): void {
    this.notificationsLoading = this.notifications.length === 0;
    this.notificationService.getDropdownNotifications(15).subscribe({
      next: (state) => {
        this.notifications = state.items as StudentNotificationItem[];
        this.unseenNotificationCount = state.unseenCount;
        this.showNotificationViewMore = state.hasMore;
        this.notificationsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        const cached = this.notificationService.getCachedDropdownState();
        this.notifications = (cached.items.length ? cached.items : this.studentDashboardService.getCachedNotifications()) as StudentNotificationItem[];
        this.unseenNotificationCount = cached.unseenCount;
        this.showNotificationViewMore = cached.hasMore;
        this.notificationsLoading = false;
        this.cdr.detectChanges();
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

  private startNotificationsRefresh(): void {
    if (this.notificationsRefreshTimer) {
      clearInterval(this.notificationsRefreshTimer);
      this.notificationsRefreshTimer = null;
    }

    this.notificationsRefreshTimer = setInterval(() => {
      this.notificationService.getDropdownNotifications(15).subscribe({
        next: (state) => {
          this.notifications = state.items as StudentNotificationItem[];
          this.unseenNotificationCount = state.unseenCount;
          this.showNotificationViewMore = state.hasMore;
          this.notificationsLoading = false;
          this.cdr.detectChanges();
        },
        error: () => void 0
      });
    }, 8000);
  }

  private markAllNotificationsSeen(): void {
    this.notificationService.markAllSeen().subscribe({
      next: () => {
        this.unseenNotificationCount = 0;
        this.notifications = this.notifications.map((item) => ({ ...item, isSeen: true } as StudentNotificationItem));
        this.cdr.detectChanges();
      },
      error: () => void 0
    });
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
      authorRole: String(item.authorRole || 'student').trim().toLowerCase(),
      authorUserCode: String(item.authorUserCode || '').trim(),
      adminBadgeLabel: String(item.adminBadgeLabel || '').trim(),
      isAdminAuthor: item.isAdminAuthor === true,
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
        authorRole: String(reply.authorRole || 'student').trim().toLowerCase(),
        authorUserCode: String(reply.authorUserCode || '').trim(),
        adminBadgeLabel: String(reply.adminBadgeLabel || '').trim(),
        isAdminAuthor: reply.isAdminAuthor === true,
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
    return !!this.event && this.isEventExpired(this.event);
  }

  private isEventExpired(event: StudentEventCard): boolean {
    const normalizedStatus = String(event.status || '').toLowerCase();
    if (normalizedStatus === 'closed' || normalizedStatus === 'completed' || normalizedStatus === 'past') {
      return true;
    }

    const parseDate = (value?: string | null): number => {
      if (!value) return Number.NaN;
      const trimmed = String(value).trim();
      if (!trimmed) return Number.NaN;
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
      const parsed = new Date(isDateOnly ? `${trimmed}T23:59:59.999` : trimmed).getTime();
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    };

    const endTimestamp = parseDate(event.endDate);
    if (!Number.isNaN(endTimestamp)) {
      return endTimestamp < Date.now();
    }

    const startTimestamp = parseDate(event.dateTime);
    if (!Number.isNaN(startTimestamp)) {
      return startTimestamp < Date.now();
    }

    return false;
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

  private getCurrentUserCode(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(currentUser.userId || currentUser.email || '').trim();
  }

  private applyEventFromNavigationState(eventId: string): void {
    const navState = history.state as { event?: StudentEventCard } | null;
    const stateEvent = navState?.event;
    if (!stateEvent) {
      return;
    }
    if (String(stateEvent.id) !== String(eventId)) {
      return;
    }
    this.event = stateEvent;
    this.loading = false;
  }

  private mergePreferredEventData(current: StudentEventCard | null, incoming: StudentEventCard | null): StudentEventCard | null {
    if (!incoming && !current) {
      return null;
    }
    if (!incoming) {
      return current;
    }
    if (!current) {
      return incoming;
    }

    const incomingDescription = String(incoming.description || '').trim();
    const currentDescription = String(current.description || '').trim();
    const shouldKeepCurrentDescription =
      (!incomingDescription || this.isFallbackDescription(incomingDescription)) && !!currentDescription;

    return {
      ...incoming,
      description: shouldKeepCurrentDescription ? currentDescription : incomingDescription
    };
  }

  private isFallbackDescription(text: string): boolean {
    return text.trim().toLowerCase() === StudentEventDetailsPageComponent.FALLBACK_DESCRIPTION.toLowerCase();
  }

}
