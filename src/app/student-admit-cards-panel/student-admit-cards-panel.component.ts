import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AttendanceService, StudentApprovedEventItem } from '../services/attendance.service';

@Component({
  selector: 'app-student-admit-cards-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-admit-cards-panel.component.html',
  styleUrls: ['./student-admit-cards-panel.component.scss']
})
export class StudentAdmitCardsPanelComponent implements OnInit {
  loading = true;
  errorMessage = '';
  approvedEvents: StudentApprovedEventItem[] = [];
  downloadingEventId = '';

  constructor(private readonly attendanceService: AttendanceService) {}

  ngOnInit(): void {
    this.loadApprovedEvents();
  }

  get hasApprovedEvents(): boolean {
    return this.approvedEvents.length > 0;
  }

  get readyCount(): number {
    return this.approvedEvents.filter((item) => item.canDownloadAdmitCard).length;
  }

  get pendingCount(): number {
    return this.approvedEvents.length - this.readyCount;
  }

  getStatusLabel(item: StudentApprovedEventItem): string {
    if (item.canDownloadAdmitCard) {
      return 'Admit Ready';
    }

    if (item.admitCardGenerated) {
      return 'Waiting for Distribution';
    }

    return 'Pending Admin Generation';
  }

  downloadAdmitCard(item: StudentApprovedEventItem): void {
    if (!item.canDownloadAdmitCard || this.downloadingEventId) {
      return;
    }

    this.downloadingEventId = item.eventId;
    this.errorMessage = '';

    this.attendanceService.downloadAdmitCard(item.eventId).pipe(
      finalize(() => {
        this.downloadingEventId = '';
      })
    ).subscribe({
      next: (blob) => {
        const safeName = String(item.eventName || 'event').replace(/[^a-z0-9]+/gi, '_');
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
        this.errorMessage = error?.error?.message || 'Admit card is not available yet. Please check again later.';
      }
    });
  }

  private loadApprovedEvents(): void {
    this.loading = true;
    this.errorMessage = '';

    this.attendanceService.getMyApprovedEvents().pipe(
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (items) => {
        this.approvedEvents = (items || []).sort((a, b) =>
          new Date(b.eventDateTime).getTime() - new Date(a.eventDateTime).getTime()
        );
      },
      error: (error) => {
        this.approvedEvents = [];
        this.errorMessage = error?.error?.message || 'Unable to load approved events right now.';
      }
    });
  }
}
