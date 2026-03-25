


import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, EventEmitter, HostListener, Input, Output, OnInit } from '@angular/core';
import { StudentEventCard, StudentEventReview, StudentDashboardService } from '../../services/student-dashboard.service';

interface CommentDisplay {
  name: string;
  comment: string;
  time: string;
}

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './event-card.component.html',
  styleUrl: './event-card.component.scss'
})
export class EventCardComponent implements OnInit {
  @Input({ required: true }) event!: StudentEventCard;
  @Input() registerLabel = 'Register';
  @Input() registerDisabled = false;
  @Input() showRegisterButton = true;
  @Output() registerClicked = new EventEmitter<void>();

  detailsOpen = false;
  tab = 'details'; // 'details' | 'feedback'
  rating = 0;
  feedbackText = '';
  comments: CommentDisplay[] = [];
  currentUserName = 'You';
  isSubmitting = false;
  submitError = '';

  constructor(private studentDashboardService: StudentDashboardService) {}

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.currentUserName = currentUser.name || 'You';
    // Load existing reviews when component inits (modal opens later)
  }

  getAvatarInitials(name: string): string {
    return name.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0,2);
  }

  toggleTab(newTab: 'details' | 'feedback') {
    this.tab = newTab;
    if (newTab === 'feedback') {
      this.loadReviews();
    }
  }

  setRating(r: number) {
    this.rating = r;
    this.submitError = '';
  }

  async loadReviews(): Promise<void> {
    try {
      const reviews = await this.studentDashboardService.getMyEventReviews([this.event.id]).toPromise();
      this.comments = this.mapReviewsToComments(reviews || []);
    } catch (error) {
      console.error('Failed to load reviews:', error);
      this.comments = [];
    }
  }

  private mapReviewsToComments(reviews: StudentEventReview[]): CommentDisplay[] {
    return reviews.map(review => ({
      name: this.currentUserName,
      comment: review.feedback,
      time: this.formatTime(review.updatedAt || review.createdAt)
    })).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }

  private formatTime(isoString: string): string {
    const now = new Date();
    const date = new Date(isoString);
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hrs ago`;
    return `${Math.floor(diffHours / 24)} days ago`;
  }

  async submitRating(): Promise<void> {
    if (this.rating === 0) return;

    this.isSubmitting = true;
    this.submitError = '';
    try {
      await this.studentDashboardService.submitEventRating(this.event.id, this.rating).toPromise();
      // Rating saved, no need to reload reviews for rating display (feedback-focused)
    } catch (error: any) {
      this.submitError = error?.error?.message || 'Failed to save rating';
    } finally {
      this.isSubmitting = false;
    }
  }

  async submitFeedback(): Promise<void> {
    const text = this.feedbackText.trim();
    if (!text) return;

    this.isSubmitting = true;
    this.submitError = '';
    try {
      await this.studentDashboardService.submitEventFeedback(this.event.id, text).toPromise();
      this.feedbackText = '';
      await this.loadReviews(); // Refresh comments list
    } catch (error: any) {
      this.submitError = error?.error?.message || 'Failed to save feedback';
    } finally {
      this.isSubmitting = false;
    }
  }

  async postFeedback(): Promise<void> {
    let hasRating = false;
    if (this.rating > 0) {
      await this.submitRating();
      hasRating = true;
    }
    if (this.feedbackText.trim()) {
      await this.submitFeedback();
    } else if (hasRating) {
      // If only rating, refresh reviews if needed
      await this.loadReviews();
    }
  }

  get safeDescription(): string {
    const text = (this.event?.description || '').trim();
    if (!text) return 'Explore this campus experience and check details.';
    return text.length > 90 ? `${text.slice(0, 90)}...` : text;
  }

  get statusLabel(): string {
    if (this.event.status === 'Registered') return 'Registered';
    if (this.event.status === 'Closed') return 'Closed';
    if (this.event.status === 'Full') return 'Full';
    return 'Open';
  }

  get cardBackground(): string {
    if (this.event?.imageUrl) {
      return `linear-gradient(180deg, rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.72)), url(${this.event.imageUrl})`;
    }
    return 'linear-gradient(135deg, #0f172a, #1d4ed8 56%, #334155)';
  }

openDetails(): void {
    document.body.style.overflow = 'hidden';
    this.detailsOpen = true;
  }

closeDetails(): void {
    document.body.style.overflow = '';
    this.detailsOpen = false;
    this.feedbackText = '';
    this.rating = 0;
    this.submitError = '';
  }

  onRegisterClick(): void {
    if (!this.registerDisabled) {
      this.registerClicked.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.detailsOpen) {
      this.closeDetails();
    }
  }
}
