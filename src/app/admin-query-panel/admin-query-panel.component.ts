import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface AdminStudentQuery {
  id: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  studentCollege: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  progressNote: string;
  adminResponse: string;
  adminResponseUpdatedAt?: string | null;
  adminRespondedBy?: string;
  escalationRequested?: boolean;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-admin-query-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-query-panel.component.html',
  styleUrls: ['./admin-query-panel.component.css']
})
export class AdminQueryPanelComponent implements OnChanges {
  @Input() queries: AdminStudentQuery[] = [];
  @Input() collegeName = '';
  @Input() loading = false;
  @Input() savingQueryId = '';
  @Input() errorMessage = '';

  @Output() submitReply = new EventEmitter<{
    queryId: string;
    adminResponse: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
    progressNote: string;
  }>();

  readonly statusOptions: Array<'OPEN' | 'IN_PROGRESS' | 'RESOLVED'> = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
  readonly drafts: Record<string, { adminResponse: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; progressNote: string }> = {};
  searchTerm = '';
  statusFilter: 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' = 'ALL';
  escalationFilter: 'ALL' | 'ESCALATED' | 'NORMAL' = 'ALL';
  selectedQueryId = '';

  get hasQueries(): boolean {
    return (this.queries || []).length > 0;
  }

  get totalQueries(): number {
    return (this.queries || []).length;
  }

  get openQueries(): number {
    return (this.queries || []).filter((query) => query.status === 'OPEN').length;
  }

  get inProgressQueries(): number {
    return (this.queries || []).filter((query) => query.status === 'IN_PROGRESS').length;
  }

  get resolvedQueries(): number {
    return (this.queries || []).filter((query) => query.status === 'RESOLVED').length;
  }

  get escalatedQueries(): number {
    return (this.queries || []).filter((query) => !!query.escalationRequested).length;
  }

  get displayCollegeName(): string {
    const college = String(this.collegeName || '').trim();
    return college || 'Assigned College';
  }

  displayStudentCollege(query: AdminStudentQuery): string {
    const studentCollege = String(query?.studentCollege || '').trim();
    if (studentCollege) {
      return studentCollege;
    }
    return 'Not set';
  }

  get sortedQueries(): AdminStudentQuery[] {
    return [...(this.queries || [])].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  get filteredQueries(): AdminStudentQuery[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.sortedQueries.filter((item) => {
      const statusMatches = this.statusFilter === 'ALL' || item.status === this.statusFilter;
      const escalationMatches = this.escalationFilter === 'ALL'
        || (this.escalationFilter === 'ESCALATED' && !!item.escalationRequested)
        || (this.escalationFilter === 'NORMAL' && !item.escalationRequested);
      const searchMatches = !query
        || String(item.subject || '').toLowerCase().includes(query)
        || String(item.message || '').toLowerCase().includes(query)
        || String(item.studentName || '').toLowerCase().includes(query)
        || String(item.studentEmail || '').toLowerCase().includes(query)
        || String(item.studentCollege || '').toLowerCase().includes(query);

      return statusMatches && escalationMatches && searchMatches;
    });
  }

  get pagedQueries(): AdminStudentQuery[] {
    return this.filteredQueries;
  }

  get selectedQuery(): AdminStudentQuery | null {
    if (!this.selectedQueryId) {
      return null;
    }
    return this.filteredQueries.find((item) => item.id === this.selectedQueryId) || null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['queries'] || changes['loading']) {
      this.resetSelectionIfMissing();
    }
  }

  onFilterChange(): void {
    this.resetSelectionIfMissing();
  }

  selectQuery(query: AdminStudentQuery): void {
    this.selectedQueryId = query.id;
  }

  isSelected(queryId: string): boolean {
    const activeId = this.selectedQuery?.id || '';
    return String(queryId || '') === activeId;
  }

  draftFor(query: AdminStudentQuery): { adminResponse: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; progressNote: string } {
    const existing = this.drafts[query.id];
    if (existing) {
      return existing;
    }

    this.drafts[query.id] = {
      adminResponse: String(query.adminResponse || '').trim(),
      status: query.status || 'OPEN',
      progressNote: String(query.progressNote || '').trim()
    };

    return this.drafts[query.id];
  }

  saveReply(query: AdminStudentQuery): void {
    const draft = this.draftFor(query);
    if (this.savingQueryId) {
      return;
    }
    const selectedStatus = draft.status || 'OPEN';

    this.submitReply.emit({
      queryId: query.id,
      adminResponse: String(draft.adminResponse || '').trim(),
      status: selectedStatus,
      progressNote: String(draft.progressNote || '').trim()
    });
  }

  formatStatus(status: AdminStudentQuery['status']): string {
    if (status === 'IN_PROGRESS') return 'In Progress';
    if (status === 'RESOLVED') return 'Solved';
    return 'Open';
  }

  getStatusTone(status: AdminStudentQuery['status']): 'pending' | 'approved' | 'warning' {
    if (status === 'RESOLVED') return 'approved';
    if (status === 'IN_PROGRESS') return 'warning';
    return 'pending';
  }

  getInitials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return 'ST';
    }

    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  trackByQueryId(_index: number, query: AdminStudentQuery): string {
    return query.id;
  }

  private resetSelectionIfMissing(): void {
    if (this.loading) {
      return;
    }

    const availableQueries = this.filteredQueries;
    if (!availableQueries.length) {
      this.selectedQueryId = '';
      return;
    }

    const currentSelectionStillVisible = availableQueries.some((item) => item.id === this.selectedQueryId);
    if (!currentSelectionStillVisible) {
      this.selectedQueryId = '';
    }
  }
}
