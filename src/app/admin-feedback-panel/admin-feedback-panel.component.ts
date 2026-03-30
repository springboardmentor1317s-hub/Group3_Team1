import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { Feedback } from '../services/feedback.service';

interface FeedbackEventRef {
  id: string;
  name: string;
}

interface AdminEventFeedbackRow {
  eventId: string;
  eventName: string;
  averageRating: number;
  totalReviews: number;
  lastUpdated: string;
  recentFeedbacks: Feedback[];
}

@Component({
  selector: 'app-admin-feedback-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-feedback-panel.component.html',
  styleUrls: ['./admin-feedback-panel.component.css']
})
export class AdminFeedbackPanelComponent implements OnChanges {
  @Input() feedbacks: Feedback[] = [];
  @Input() events: FeedbackEventRef[] = [];
  @Input() isLoading = false;

  averageRating = 0;
  totalFeedbacks = 0;
  eventRows: AdminEventFeedbackRow[] = [];

  ngOnChanges(): void {
    this.rebuildViewModel();
  }

  get averageRatingStars(): string {
    if (!this.averageRating) return 'No ratings yet';
    const fullStars = Math.floor(this.averageRating);
    const hasHalfStar = this.averageRating % 1 >= 0.5;
    let stars = '★'.repeat(fullStars);
    if (hasHalfStar) stars += '½';
    return stars.padEnd(hasHalfStar ? fullStars + 1 : fullStars, '☆');
  }

  get responseRate(): number {
    if (!this.events.length || !this.totalFeedbacks) return 0;
    return Math.round((this.totalFeedbacks / this.events.length) * 100);
  }

  getFeedbackCountByRating(rating: number): number {
    return this.feedbacks.filter((feedback) => Number(feedback.rating) === rating).length;
  }

  getRatingPercentage(rating: number): number {
    if (!this.totalFeedbacks) return 0;
    return (this.getFeedbackCountByRating(rating) / this.totalFeedbacks) * 100;
  }

  getRowStars(value: number): string {
    const rounded = Math.round(value);
    return `${'★'.repeat(Math.max(0, rounded))}${'☆'.repeat(Math.max(0, 5 - rounded))}`;
  }

  formatDate(value: string): string {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Recently updated';
    }
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  trackByEventId(_index: number, row: AdminEventFeedbackRow): string {
    return row.eventId;
  }

  trackByFeedbackId(_index: number, feedback: Feedback): string {
    return String(feedback._id || `${feedback.eventId}-${feedback.createdAt}`);
  }

  private rebuildViewModel(): void {
    const sortedFeedbacks = [...(this.feedbacks || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    this.totalFeedbacks = sortedFeedbacks.length;

    if (!sortedFeedbacks.length) {
      this.averageRating = 0;
      this.eventRows = [];
      return;
    }

    const totalRating = sortedFeedbacks.reduce((sum, feedback) => sum + Number(feedback.rating || 0), 0);
    this.averageRating = Math.round((totalRating / sortedFeedbacks.length) * 10) / 10;

    const eventNameById = new Map<string, string>(
      (this.events || []).map((event) => [String(event.id), String(event.name || 'Event')])
    );
    const grouped = new Map<string, Feedback[]>();

    for (const feedback of sortedFeedbacks) {
      const eventId = String(feedback.eventId || '').trim();
      if (!eventId) continue;
      const current = grouped.get(eventId) || [];
      current.push(feedback);
      grouped.set(eventId, current);
    }

    this.eventRows = Array.from(grouped.entries())
      .map(([eventId, group]) => {
        const rowTotal = group.reduce((sum, feedback) => sum + Number(feedback.rating || 0), 0);
        const latest = group[0];
        return {
          eventId,
          eventName: eventNameById.get(eventId) || `Event ${eventId}`,
          averageRating: Math.round((rowTotal / group.length) * 10) / 10,
          totalReviews: group.length,
          lastUpdated: String(latest?.updatedAt || latest?.createdAt || ''),
          recentFeedbacks: group.slice(0, 3)
        };
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.averageRating - a.averageRating;
      });
  }
}
