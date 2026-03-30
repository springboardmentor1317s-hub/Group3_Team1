import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AdminAttendanceEventItem,
  AdminAttendanceRosterResponse,
  AdminAttendanceRosterStudent,
  AttendanceService
} from '../services/attendance.service';

type BannerTone = 'success' | 'error' | 'warning' | 'info';

@Component({
  selector: 'app-admin-attendance-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-attendance-workspace.component.html',
  styleUrls: ['./admin-attendance-workspace.component.css']
})
export class AdminAttendanceWorkspaceComponent implements OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('scannerCanvas') scannerCanvas?: ElementRef<HTMLCanvasElement>;

  loadingEvents = false;
  loadingRoster = false;
  events: AdminAttendanceEventItem[] = [];
  selectedEvent: AdminAttendanceEventItem | null = null;
  roster: AdminAttendanceRosterResponse | null = null;
  showAttendanceScreen = false;
  studentSearch = '';
  scanInput = '';
  scanBusy = false;
  openingCamera = false;
  cameraStarted = false;
  scannerMessage = 'Scan QR to Mark Attendance';
  scannerWarning = '';
  actionMessage = '';
  actionTone: BannerTone = 'info';

  private mediaStream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private detector: { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private lastScannedRawValue = '';
  private lastScannedAt = 0;
  private pendingOpenEventId = '';

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly route: ActivatedRoute
  ) {
    this.route.queryParamMap.subscribe((params) => {
      this.pendingOpenEventId = String(params.get('eventId') || '').trim();
      if (this.pendingOpenEventId && this.events.length) {
        this.openRequestedEventIfAvailable();
      }
    });
    this.loadTodayEvents();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.stopAutoRefresh();
  }

  get totalStudents(): number {
    return Number(this.roster?.totalApproved || 0);
  }

  get presentStudents(): number {
    return Number(this.roster?.presentCount || 0);
  }

  get pendingStudents(): number {
    return Math.max(0, this.totalStudents - this.presentStudents);
  }

  get filteredStudents(): AdminAttendanceRosterStudent[] {
    const students = this.roster?.students || [];
    const query = this.studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const name = String(student.studentName || '').toLowerCase();
      const id = String(student.studentId || '').toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }

  loadTodayEvents(): void {
    this.loadingEvents = true;
    this.attendanceService.getTodayAttendanceEvents().pipe(
      finalize(() => {
        this.loadingEvents = false;
      })
    ).subscribe({
      next: (events) => {
        this.events = events || [];
        if (!this.selectedEvent && this.events.length > 0 && !this.pendingOpenEventId) {
          this.openAttendanceScreen(this.events[0]);
          return;
        }
        if (this.selectedEvent) {
          const selectedEventId = this.selectedEvent.eventId;
          const refreshed = this.events.find((event) => event.eventId === selectedEventId) || null;
          this.selectedEvent = refreshed;
          if (refreshed && this.showAttendanceScreen) {
            this.loadRoster(refreshed.eventId);
          }
          if (!refreshed) {
            this.showAttendanceScreen = false;
            this.roster = null;
          }
        }
        this.openRequestedEventIfAvailable();
      },
      error: (error) => {
        this.events = [];
        this.showBanner(error?.error?.message || 'Unable to load today events right now.', 'error');
      }
    });
  }

  showTodayEventCards(): void {
    this.showAttendanceScreen = false;
    this.stopScanner();
    this.loadTodayEvents();
  }

  openAttendanceFromButton(): void {
    if (!this.events.length) {
      this.showBanner('No events available for today.', 'warning');
      return;
    }

    const target = this.selectedEvent || this.events[0];
    this.openAttendanceScreen(target);
  }

  openAttendanceScreen(event: AdminAttendanceEventItem): void {
    this.selectedEvent = event;
    this.showAttendanceScreen = true;
    this.stopScanner();
    this.cameraStarted = false;
    this.scannerMessage = 'Click "Open Camera" to start QR scanning.';
    this.loadRoster(event.eventId);
  }

  openCamera(): void {
    if (!this.showAttendanceScreen || !this.selectedEvent || !this.roster || this.openingCamera) {
      return;
    }
    this.initializeScanner();
  }

  onManualScanSubmit(): void {
    const value = this.scanInput.trim();
    if (!value || this.scanBusy) return;
    this.processScan(this.buildManualScanPayload(value));
  }

  getStatusLabel(status: string): 'Present' | 'Pending' {
    return String(status || '').toUpperCase() === 'PRESENT' ? 'Present' : 'Pending';
  }

  getStatusClass(status: string): string {
    return String(status || '').toUpperCase() === 'PRESENT' ? 'present' : 'pending';
  }

  private loadRoster(eventId: string): void {
    this.loadingRoster = true;
    this.roster = null;

    this.attendanceService.getAttendanceRoster(eventId).pipe(
      finalize(() => {
        this.loadingRoster = false;
      })
    ).subscribe({
      next: (roster) => {
        this.roster = roster;
        this.scannerWarning = '';
        this.scannerMessage = 'Click "Open Camera" to start QR scanning.';
      },
      error: (error) => {
        this.roster = null;
        this.showBanner(error?.error?.message || 'Unable to load approved students list.', 'error');
      }
    });
  }

  private async initializeScanner(): Promise<void> {
    if (this.openingCamera) return;
    this.openingCamera = true;
    this.stopScanner();
    this.scannerWarning = '';
    this.cameraStarted = false;

    try {
      const detectorCtor = (window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> };
      }).BarcodeDetector;

      const video = this.scannerVideo?.nativeElement;
      if (!video) {
        this.scannerWarning = 'Camera view is not ready. Please click Open Camera again.';
        return;
      }

      if (detectorCtor) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        video.srcObject = this.mediaStream;
        if (video.paused) {
          await video.play();
        }
        this.detector = new detectorCtor({ formats: ['qr_code'] });
        this.startScanLoop();
      } else {
        this.detector = null;
        this.scannerWarning = 'Live QR scanning is not supported in this browser. Use manual scan input.';
        return;
      }

      this.cameraStarted = true;
      this.scannerMessage = 'Live camera connected. Scan QR to mark attendance.';
      this.scannerWarning = '';
    } catch {
      this.scannerWarning = 'Camera unavailable or permission denied. Use manual scan input.';
    } finally {
      this.openingCamera = false;
    }
  }

  private startScanLoop(): void {
    if (!this.detector || this.scanTimer) return;

    this.scanTimer = setInterval(async () => {
      if (!this.showAttendanceScreen || this.scanBusy || !this.roster) return;

      const video = this.scannerVideo?.nativeElement;
      const canvas = this.scannerCanvas?.nativeElement;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const detector = this.detector;
        if (!detector) return;
        const codes = await detector.detect(canvas);
        const rawValue = String(codes?.[0]?.rawValue || '').trim();
        if (!rawValue) return;
        const parsedPayload = this.normalizeAutoScanPayload(rawValue);
        if (!parsedPayload) {
          return;
        }
        const now = Date.now();
        if (rawValue === this.lastScannedRawValue && now - this.lastScannedAt < 1500) {
          return;
        }
        this.lastScannedRawValue = rawValue;
        this.lastScannedAt = now;
        this.processScan(parsedPayload);
      } catch {
        // Ignore transient scanner read issues.
      }
    }, 650);
  }

  private processScan(rawValue: string | { studentId: string; eventId: string; token: string }): void {
    if (this.scanBusy || !this.selectedEvent || !this.roster) return;

    this.scanBusy = true;
    this.attendanceService.scanAttendance(rawValue).pipe(
      finalize(() => {
        this.scanBusy = false;
      })
    ).subscribe({
      next: (response) => {
        const code = String(response.code || '').toUpperCase();

        if (code === 'MARKED') {
          this.showBanner('Attendance Marked', 'success');
          this.applyLiveStudentStatus(response.student?.id || '', 'PRESENT');
          if (typeof response.presentCount === 'number' && this.roster) {
            this.roster.presentCount = Number(response.presentCount);
          }
          return;
        }

        if (code === 'ALREADY_MARKED') {
          this.showBanner('Already Marked', 'error');
          return;
        }

        this.showBanner(response.message || 'Invalid QR', 'error');
      },
      error: (error) => {
        const code = String(error?.error?.code || '').toUpperCase();
        if (code === 'ALREADY_MARKED') {
          this.showBanner('Already Marked', 'error');
          return;
        }
        if (code === 'INVALID_QR') {
          this.showBanner('Invalid QR', 'error');
          return;
        }
        this.showBanner(error?.error?.message || 'Scan failed. Try again.', 'error');
      }
    });
  }

  private applyLiveStudentStatus(studentId: string, status: 'PENDING' | 'PRESENT'): void {
    if (!studentId || !this.roster) return;
    const target = this.roster.students.find((student) => String(student.studentId) === String(studentId));
    if (target) {
      target.status = status;
      target.markedAt = new Date().toISOString();
    }
  }

  private showBanner(message: string, tone: BannerTone): void {
    this.actionMessage = message;
    this.actionTone = tone;
    setTimeout(() => {
      if (this.actionMessage === message) {
        this.actionMessage = '';
      }
    }, 2600);
  }

  private stopScanner(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    const tracks = this.mediaStream?.getTracks() || [];
    tracks.forEach((track) => track.stop());
    this.mediaStream = null;
    this.cameraStarted = false;
    this.openingCamera = false;
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.silentRefresh();
    }, 4500);
  }

  private stopAutoRefresh(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private silentRefresh(): void {
    if (this.loadingEvents || this.loadingRoster || !this.events.length) {
      return;
    }

    this.attendanceService.getTodayAttendanceEvents().subscribe({
      next: (events) => {
        this.events = events || [];
        if (!this.selectedEvent) return;

        const selectedEventId = this.selectedEvent.eventId;
        const refreshedSelected = this.events.find((event) => event.eventId === selectedEventId) || null;
        this.selectedEvent = refreshedSelected;
        if (!refreshedSelected || !this.showAttendanceScreen) {
          return;
        }
        this.attendanceService.getAttendanceRoster(refreshedSelected.eventId).subscribe({
          next: (roster) => {
            this.roster = roster;
          }
        });
      }
    });
  }

  private openRequestedEventIfAvailable(): void {
    const requestedEventId = this.pendingOpenEventId;
    if (!requestedEventId) return;

    const matchedEvent = this.events.find((event) => String(event.eventId) === requestedEventId) || null;
    if (!matchedEvent) return;

    this.pendingOpenEventId = '';
    this.openAttendanceScreen(matchedEvent);
  }

  private buildManualScanPayload(inputValue: string): string | { studentId: string; eventId: string; token: string } {
    const raw = String(inputValue || '').trim();
    if (!raw || !this.selectedEvent) {
      return raw;
    }

    const looksLikeJson = raw.startsWith('{') && raw.endsWith('}');
    const looksLikeUrl = /^https?:\/\//i.test(raw);
    if (looksLikeJson || looksLikeUrl) {
      return raw;
    }

    const normalized = raw.toLowerCase();
    const matchedStudent = (this.roster?.students || []).find((student) => {
      const studentId = String(student.studentId || '').trim().toLowerCase();
      const cardCode = String(student.cardCode || '').trim().toLowerCase();
      return normalized === studentId || (cardCode && normalized === cardCode);
    });

    if (matchedStudent) {
      return {
        studentId: matchedStudent.studentId,
        eventId: this.selectedEvent.eventId,
        token: 'MANUAL_OVERRIDE'
      };
    }

    return {
      studentId: raw,
      eventId: this.selectedEvent.eventId,
      token: 'MANUAL_OVERRIDE'
    };
  }
  private normalizeAutoScanPayload(rawValue: string): string | { studentId: string; eventId: string; token: string } | null {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;

    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw) as { studentId?: string; eventId?: string; token?: string };
        if (parsed?.studentId && parsed?.eventId && parsed?.token) {
          return raw;
        }
      } catch {
        return null;
      }
      return null;
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        const studentId = String(url.searchParams.get('studentId') || '').trim();
        const eventId = String(url.searchParams.get('eventId') || '').trim();
        const token = String(url.searchParams.get('token') || '').trim();
        if (studentId && eventId && token) {
          return raw;
        }
      } catch {
        return null;
      }
      return null;
    }

    return null;
  }
}
