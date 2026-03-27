import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Registration {
  id: string;
  studentName: string;
  studentId: string;
  studentEmail: string;
  email: string;
  college: string;
  eventName: string;
  eventId: string;
  registrationDate: string;
  submittedDate: string;
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

interface RegistrationGroup {
  eventId: string;
  eventName: string;
  registrations: Registration[];
  total: number;
  isClosed: boolean;
  statusLabel: 'Open' | 'Closed';
}

@Component({
  selector: 'app-admin-registrations-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-registrations-panel.component.html',
  styleUrls: ['./admin-registrations-panel.component.css']
})
export class AdminRegistrationsPanelComponent {
  @Input() searchQuery = '';
  @Input() groupedRegistrations: RegistrationGroup[] = [];
  @Input() flatRegistrations: Registration[] = [];
  @Input() registrationFilter = 'all';

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();
  @Output() approve = new EventEmitter<Registration>();
  @Output() reject = new EventEmitter<Registration>();
}
