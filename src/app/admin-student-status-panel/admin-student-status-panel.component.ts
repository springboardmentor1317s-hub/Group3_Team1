import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

interface RegistrationRow {
  id: string;
  studentName: string;
  college: string;
  eventName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

interface EventGroup {
  eventName: string;
  rows: RegistrationRow[];
}

@Component({
  selector: 'app-admin-student-status-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-student-status-panel.component.html',
  styleUrls: ['./admin-student-status-panel.component.css']
})
export class AdminStudentStatusPanelComponent {
  @Input() registrations: RegistrationRow[] = [];

  activeStatus: 'APPROVED' | 'REJECTED' = 'APPROVED';

  setStatus(status: 'APPROVED' | 'REJECTED'): void {
    this.activeStatus = status;
  }

  get visibleRows(): RegistrationRow[] {
    return (this.registrations || []).filter((row) => row.status === this.activeStatus);
  }

  get panelTitle(): string {
    return this.activeStatus === 'APPROVED' ? 'Approved Students' : 'Rejected Students';
  }

  get panelKicker(): string {
    return this.activeStatus === 'APPROVED' ? 'Approved List' : 'Rejected List';
  }

  get panelSubtitle(): string {
    return this.activeStatus === 'APPROVED'
      ? 'Event-wise approved students with college details.'
      : 'Event-wise rejected students with reason and college details.';
  }

  get groupedRows(): EventGroup[] {
    const grouped = this.visibleRows.reduce((acc, row) => {
      const eventName = String(row.eventName || 'Event Not Available').trim();
      if (!acc[eventName]) {
        acc[eventName] = [];
      }
      acc[eventName].push(row);
      return acc;
    }, {} as Record<string, RegistrationRow[]>);

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map((eventName) => ({
        eventName,
        rows: grouped[eventName]
      }));
  }

  trackByEventName(_index: number, group: EventGroup): string {
    return group.eventName;
  }

  trackByRegistrationId(_index: number, row: RegistrationRow): string {
    return row.id;
  }
}
