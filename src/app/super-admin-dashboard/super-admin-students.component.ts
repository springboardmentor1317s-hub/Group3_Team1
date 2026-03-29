import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../auth/auth';
import { StudentRegistrationSummary, SuperAdminService, SuperAdminStudent } from './super-admin-service';

@Component({
  selector: 'app-super-admin-students',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './super-admin-students.component.html',
  styleUrls: ['./super-admin-dashboard.css', './super-admin-students.component.css']
})
export class SuperAdminStudentsComponent implements OnInit {
  students: SuperAdminStudent[] = [];
  isLoadingStudents = false;
  studentsError = '';
  searchTerm = '';
  selectedCollege = 'all';
  showDetailsModal = false;
  showEventsModal = false;
  selectedStudent: SuperAdminStudent | null = null;
  selectedStudentEvents: StudentRegistrationSummary[] = [];
  isLoadingEvents = false;
  eventsError = '';

  constructor(
    private auth: Auth,
    private router: Router,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadStudents();
  }

  loadStudents(): void {
    this.isLoadingStudents = true;
    this.studentsError = '';

    this.superAdminService.getAllStudents().subscribe({
      next: (students) => {
        this.students = students;
        this.isLoadingStudents = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.students = [];
        this.isLoadingStudents = false;
        this.studentsError = 'Failed to load students.';
        this.cdr.detectChanges();
      }
    });
  }

  trackStudent(_: number, student: SuperAdminStudent): string {
    return student._id;
  }

  get collegeOptions(): string[] {
    const colleges = this.students
      .map((student) => (student.college || '').trim())
      .filter((college) => college.length > 0);

    return Array.from(new Set(colleges)).sort((a, b) => a.localeCompare(b));
  }

  get filteredStudents(): SuperAdminStudent[] {
    const query = this.searchTerm.trim().toLowerCase();

    return this.students.filter((student) => {
      const studentCollege = (student.college || '').trim();
      const collegeMatches = this.selectedCollege === 'all' || studentCollege === this.selectedCollege;
      if (!collegeMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchText = [
        student.name,
        student.userId,
        student.email,
        student.college || ''
      ].join(' ').toLowerCase();

      return searchText.includes(query);
    });
  }

  openStudentDetails(student: SuperAdminStudent): void {
    this.selectedStudent = student;
    this.showDetailsModal = true;
  }

  openStudentEvents(student: SuperAdminStudent): void {
    this.selectedStudent = student;
    this.showEventsModal = true;
    this.isLoadingEvents = true;
    this.eventsError = '';
    this.selectedStudentEvents = [];

    this.superAdminService.getStudentRegistrations(student._id).subscribe({
      next: (events) => {
        this.selectedStudentEvents = events;
        this.isLoadingEvents = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingEvents = false;
        this.eventsError = 'Failed to load registered events.';
        this.cdr.detectChanges();
      }
    });
  }

  closeModals(): void {
    this.showDetailsModal = false;
    this.showEventsModal = false;
    this.selectedStudent = null;
    this.selectedStudentEvents = [];
    this.eventsError = '';
    this.isLoadingEvents = false;
  }

  getStudentStatus(student: SuperAdminStudent): string {
    return student.isBlocked ? 'Blocked' : 'Active';
  }

  getStudentAddress(student: SuperAdminStudent): string {
    return (student.currentAddressLine || student.permanentAddressLine || '').trim() || 'Not provided';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
