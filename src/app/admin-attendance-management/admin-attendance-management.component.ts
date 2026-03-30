import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import {
  AdminAttendanceEventItem,
  AdminAttendanceRosterResponse,
  AttendanceService
} from '../services/attendance.service';

type ScanTone = 'idle' | 'success' | 'error' | 'warning';

@Component({
  selector: 'app-admin-attendance-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-attendance-management.component.html',
  styleUrls: ['./admin-attendance-management.component.css']
})
export class AdminAttendanceManagementComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('scannerCanvas') scannerCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('attendanceWorkspace') attendanceWorkspace?: ElementRef<HTMLElement>;
  @ViewChild('eventsCardSection') eventsCardSection?: ElementRef<HTMLElement>;

  loadingEvents = true;
  loadingRoster = false;
  generatingEventId = '';
  previewingEventId = '';
  previewingStudentCardKey = '';
  notificationMessage = '';
  notificationTone: 'success' | 'error' | 'info' = 'info';
  scanningInProgress = false;
  scanMessage = 'Scanner is ready. Hold admit card QR in front of the camera.';
  scanTone: ScanTone = 'idle';
  manualScanInput = '';
  events: AdminAttendanceEventItem[] = [];
  selectedEvent: AdminAttendanceEventItem | null = null;
  roster: AdminAttendanceRosterResponse | null = null;
  errorMessage = '';
  showEvents = true;
  showAttendanceScreen = false;
  distributionActionInProgress = false;

  private mediaStream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private detector: { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } | null = null;
  private isCameraReady = false;
  private lastScannedRawValue = '';
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private generateFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private previewFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly detectorSupported = typeof (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector !== 'undefined';

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly router: Router
  ) {}

  ngAfterViewInit(): void {
    this.loadTodayEvents();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.stopAutoRefresh();
    this.clearGenerateFallbackTimer();
    this.clearPreviewFallbackTimer();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
      this.notificationTimer = null;
    }
  }

  get presentCount(): number {
    return Number(this.roster?.presentCount || 0);
  }

  get totalCount(): number {
    return Number(this.roster?.totalApproved || 0);
  }

  get hasTodayEvents(): boolean {
    return this.events.length > 0;
  }

  selectEvent(event: AdminAttendanceEventItem): void {
    this.selectedEvent = event;
    this.loadRoster(event.eventId);
  }

  openAttendanceScreen(event: AdminAttendanceEventItem): void {
    this.selectEvent(event);
    this.showAttendanceScreen = true;
    setTimeout(() => {
      this.attendanceWorkspace?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 120);
  }

  showTodayEventsSection(): void {
    this.showEvents = true;
    this.eventsCardSection?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    if (!this.selectedEvent && this.events.length > 0) {
      this.openAttendanceScreen(this.events[0]);
    } else if (this.selectedEvent) {
      this.openAttendanceScreen(this.selectedEvent);
    }
  }

  openAttendanceScannerPage(): void {
    const eventId = String(this.selectedEvent?.eventId || '').trim();
    if (eventId) {
      this.router.navigate(['/admin-attendance-screen'], {
        queryParams: { eventId }
      });
      return;
    }

    this.router.navigate(['/admin-attendance-screen']);
  }

  openSelectedAttendanceScreen(): void {
    this.showEvents = true;
    if (!this.selectedEvent) {
      this.scanTone = 'warning';
      this.scanMessage = 'Please click an event card first to open attendance screen.';
      return;
    }
    this.showAttendanceScreen = true;

    setTimeout(() => {
      this.attendanceWorkspace?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 120);
  }

  generateForSelectedEvent(): void {
    if (!this.selectedEvent) {
      return;
    }
    this.generateAdmitCards(this.selectedEvent);
  }

  previewForSelectedEvent(): void {
    if (!this.selectedEvent || this.previewingEventId) {
      return;
    }

    const eventId = this.selectedEvent.eventId;
    const previewWindow = window.open('', '_blank');
    this.previewingEventId = eventId;
    this.errorMessage = '';
    if (previewWindow) {
      previewWindow.document.write('<p style="font-family:Arial;padding:16px">Loading ID card preview...</p>');
      previewWindow.document.close();
    }
    this.clearPreviewFallbackTimer();
    this.previewFallbackTimer = setTimeout(() => {
      this.previewingEventId = '';
      if (previewWindow) {
        previewWindow.close();
      }
      this.showNotification('Preview request timed out. Please try again.', 'error');
    }, 15000);

    this.attendanceService.previewAdmitCard(eventId).pipe(
      timeout(14000),
      finalize(() => {
        this.clearPreviewFallbackTimer();
        this.previewingEventId = '';
      })
    ).subscribe({
      next: async (blob) => {
        const blobType = String(blob?.type || '').toLowerCase();
        if (!blobType.includes('pdf')) {
          let message = 'Preview file is invalid.';
          try {
            const text = await blob.text();
            const parsed = JSON.parse(text) as { message?: string };
            message = String(parsed?.message || message);
          } catch {
            // Ignore parse issues and use fallback message.
          }
          if (previewWindow) {
            previewWindow.close();
          }
          this.errorMessage = message;
          this.showNotification(message, 'error');
          return;
        }

        const fileUrl = URL.createObjectURL(blob);
        if (previewWindow) {
          previewWindow.location.href = fileUrl;
        } else {
          window.open(fileUrl, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(fileUrl), 40000);
        this.showNotification('ID card preview is ready.', 'success');
      },
      error: async (error: HttpErrorResponse) => {
        if (previewWindow) {
          previewWindow.close();
        }
        const message = await this.getApiErrorMessage(error, 'Failed to preview ID card.');
        this.errorMessage = message;
        this.showNotification(message, 'error');
      }
    });
  }

  previewStudentCard(studentId: string, studentName: string): void {
    if (!this.selectedEvent || !studentId || this.previewingStudentCardKey) {
      return;
    }

    const eventId = this.selectedEvent.eventId;
    const cardKey = `${eventId}:${studentId}`;
    this.previewingStudentCardKey = cardKey;

    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(`<p style="font-family:Arial;padding:16px">Loading ID card preview for ${studentName}...</p>`);
      previewWindow.document.close();
    }

    this.attendanceService.previewStudentAdmitCard(eventId, studentId).pipe(
      timeout(14000),
      finalize(() => {
        this.previewingStudentCardKey = '';
      })
    ).subscribe({
      next: async (blob) => {
        const blobType = String(blob?.type || '').toLowerCase();
        if (!blobType.includes('pdf')) {
          let message = 'Preview file is invalid.';
          try {
            const text = await blob.text();
            const parsed = JSON.parse(text) as { message?: string };
            message = String(parsed?.message || message);
          } catch {
            // Ignore parse issues and use fallback message.
          }
          if (previewWindow) {
            previewWindow.close();
          }
          this.showNotification(message, 'error');
          return;
        }

        const fileUrl = URL.createObjectURL(blob);
        if (previewWindow) {
          previewWindow.location.href = fileUrl;
        } else {
          window.open(fileUrl, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(fileUrl), 40000);
        this.showNotification(`ID card opened for ${studentName}.`, 'success');
      },
      error: async (error: HttpErrorResponse) => {
        if (previewWindow) {
          previewWindow.close();
        }
        const message = await this.getApiErrorMessage(error, `Failed to preview ID card for ${studentName}.`);
        this.showNotification(message, 'error');
      }
    });
  }

  distributeForSelectedEvent(): void {
    if (!this.selectedEvent || this.distributionActionInProgress) {
      return;
    }

    this.distributionActionInProgress = true;
    setTimeout(() => {
      this.distributionActionInProgress = false;
      this.showNotification('Admit card links distributed to all approved students.', 'success');
    }, 450);
  }

  generateAdmitCards(event: AdminAttendanceEventItem): void {
    if (this.generatingEventId) return;
    this.generatingEventId = event.eventId;
    this.errorMessage = '';
    this.clearGenerateFallbackTimer();
    this.generateFallbackTimer = setTimeout(() => {
      this.generatingEventId = '';
      this.showNotification('Generation request timed out. Please try again.', 'error');
    }, 20000);

    this.attendanceService.generateAdmitCards(event.eventId).pipe(
      timeout(18000),
      finalize(() => {
        this.clearGenerateFallbackTimer();
        this.generatingEventId = '';
      })
    ).subscribe({
      next: (response) => {
        const failed = Number(response.failed || 0);
        this.showNotification(
          failed > 0
            ? `Admit card generated with partial issues. Created: ${Number(response.created || 0)}, Updated: ${Number(response.refreshed || 0)}, Failed: ${failed}.`
            : `Admit card is generated. Created: ${Number(response.created || 0)}, Updated: ${Number(response.refreshed || 0)}, Approved: ${Number(response.totalApproved || 0)}.`,
          failed > 0 ? 'info' : 'success'
        );
        this.loadTodayEvents();
        if (this.selectedEvent?.eventId === event.eventId) {
          this.loadRoster(event.eventId);
        }
      },
      error: async (error: HttpErrorResponse) => {
        const message = await this.getApiErrorMessage(error, 'Failed to generate admit cards.');
        this.showNotification(message, 'error');
      }
    });
  }

  scanFromManualInput(): void {
    const raw = this.manualScanInput.trim();
    if (!raw || this.scanningInProgress) return;
    this.processScannedPayload(raw);
  }

  getStudentStatusClass(status: string): string {
    return String(status || '').toUpperCase() === 'PRESENT' ? 'present' : 'pending';
  }

  private loadTodayEvents(): void {
    this.loadingEvents = true;
    this.errorMessage = '';

    this.attendanceService.getTodayAttendanceEvents().pipe(
      finalize(() => {
        this.loadingEvents = false;
      })
    ).subscribe({
      next: (events) => {
        this.events = events || [];
        if (!this.selectedEvent && this.events.length > 0) {
          this.openAttendanceScreen(this.events[0]);
          return;
        }
        if (this.selectedEvent) {
          const selectedEventId = this.selectedEvent.eventId;
          const refreshed = this.events.find((item) => item.eventId === selectedEventId);
          if (refreshed) {
            this.selectedEvent = refreshed;
            if (this.showAttendanceScreen) {
              this.loadRoster(refreshed.eventId);
            }
          } else {
            this.selectedEvent = null;
            this.roster = null;
            this.showAttendanceScreen = false;
          }
        }
      },
      error: (error) => {
        this.events = [];
        this.errorMessage = error?.error?.message || 'Unable to load attendance events right now.';
      }
    });
  }

  private loadRoster(eventId: string): void {
    this.loadingRoster = true;
    this.roster = null;
    this.errorMessage = '';

    this.attendanceService.getAttendanceRoster(eventId).pipe(
      finalize(() => {
        this.loadingRoster = false;
      })
    ).subscribe({
      next: (roster) => {
        this.roster = roster;
      },
      error: (error) => {
        this.roster = null;
        this.errorMessage = error?.error?.message || 'Unable to load roster for selected event.';
      }
    });
  }

  private async initializeScanner(): Promise<void> {
    if (!this.detectorSupported) {
      this.scanTone = 'warning';
      this.scanMessage = 'Live camera scan is not supported in this browser. Use manual QR payload input below.';
      return;
    }

    try {
      const detectorCtor = (window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> };
      }).BarcodeDetector;

      if (!detectorCtor) {
        this.scanTone = 'warning';
        this.scanMessage = 'QR detector is not available. Use manual scan input.';
        return;
      }

      this.detector = new detectorCtor({ formats: ['qr_code'] });
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      const video = this.scannerVideo?.nativeElement;
      if (!video) return;

      video.srcObject = this.mediaStream;
      await video.play();
      this.isCameraReady = true;
      this.startScanLoop();
      this.scanMessage = 'Camera connected. Scan QR to mark attendance.';
      this.scanTone = 'idle';
    } catch {
      this.scanTone = 'warning';
      this.scanMessage = 'Camera permission denied or unavailable. Use manual scan input.';
    }
  }

  private startScanLoop(): void {
    if (!this.detector || this.scanTimer) return;

    this.scanTimer = setInterval(async () => {
      if (!this.isCameraReady || this.scanningInProgress || !this.selectedEvent || !this.roster) {
        return;
      }

      const video = this.scannerVideo?.nativeElement;
      const canvas = this.scannerCanvas?.nativeElement;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        return;
      }

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
        if (!rawValue || rawValue === this.lastScannedRawValue) {
          return;
        }
        this.lastScannedRawValue = rawValue;
        this.processScannedPayload(rawValue);
      } catch {
        // Ignore transient decode errors.
      }
    }, 600);
  }

  private processScannedPayload(rawValue: string): void {
    if (!this.selectedEvent || !this.roster || this.scanningInProgress) {
      return;
    }

    this.scanningInProgress = true;
    this.attendanceService.scanAttendance(rawValue).pipe(
      finalize(() => {
        this.scanningInProgress = false;
      })
    ).subscribe({
      next: (response) => {
        const scannedName = String(response.student?.name || '').trim();
        if (response.code === 'MARKED') {
          this.scanTone = 'success';
          this.scanMessage = scannedName
            ? `Attendance marked: ${scannedName}`
            : 'Attendance marked successfully.';
          this.loadRoster(this.selectedEvent!.eventId);
          this.loadTodayEvents();
          return;
        }

        if (response.code === 'ALREADY_MARKED') {
          this.scanTone = 'warning';
          this.scanMessage = scannedName
            ? `Already marked: ${scannedName}`
            : 'Attendance already marked for this student.';
          return;
        }

        this.scanTone = 'error';
        this.scanMessage = response.message || 'Invalid QR';
      },
      error: (error) => {
        const code = String(error?.error?.code || '').toUpperCase();
        if (code === 'ALREADY_MARKED') {
          this.scanTone = 'warning';
          this.scanMessage = 'Attendance already marked for this student.';
          return;
        }
        if (code === 'INVALID_QR') {
          this.scanTone = 'error';
          this.scanMessage = 'Invalid QR. Please scan a valid admit card.';
          return;
        }
        this.scanTone = 'error';
        this.scanMessage = error?.error?.message || 'Scan failed. Please try again.';
      }
    });
  }

  private stopScanner(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    const tracks = this.mediaStream?.getTracks() || [];
    tracks.forEach((track) => track.stop());
    this.mediaStream = null;
    this.isCameraReady = false;
  }

  private showNotification(message: string, tone: 'success' | 'error' | 'info' = 'info'): void {
    this.notificationMessage = message;
    this.notificationTone = tone;
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    this.notificationTimer = setTimeout(() => {
      this.notificationMessage = '';
      this.notificationTimer = null;
    }, 3200);
  }

  private clearGenerateFallbackTimer(): void {
    if (this.generateFallbackTimer) {
      clearTimeout(this.generateFallbackTimer);
      this.generateFallbackTimer = null;
    }
  }

  private clearPreviewFallbackTimer(): void {
    if (this.previewFallbackTimer) {
      clearTimeout(this.previewFallbackTimer);
      this.previewFallbackTimer = null;
    }
  }

  private async getApiErrorMessage(error: HttpErrorResponse, fallback: string): Promise<string> {
    const directMessage = String((error as { error?: { message?: string } })?.error?.message || '').trim();
    if (directMessage) {
      return directMessage;
    }

    const payload = error?.error;
    if (payload instanceof Blob) {
      try {
        const text = await payload.text();
        const parsed = JSON.parse(text) as { message?: string };
        const blobMessage = String(parsed?.message || '').trim();
        if (blobMessage) {
          return blobMessage;
        }
      } catch {
        // Ignore parse failures and fall back.
      }
    }

    if (error?.status === 404) {
      return 'Preview route not found. Please restart backend server once.';
    }
    if (error?.status === 401) {
      return 'Session expired. Please login again.';
    }
    if (error?.status === 403) {
      return 'You are not allowed to access this event.';
    }

    return fallback;
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.silentRefresh();
    }, 5000);
  }

  private stopAutoRefresh(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private silentRefresh(): void {
    if (this.loadingEvents || this.loadingRoster) {
      return;
    }

    this.attendanceService.getTodayAttendanceEvents().subscribe({
      next: (events) => {
        this.events = events || [];
        if (!this.selectedEvent) return;

        const selectedEventId = this.selectedEvent.eventId;
        const refreshed = this.events.find((item) => item.eventId === selectedEventId) || null;
        this.selectedEvent = refreshed;
        if (!refreshed || !this.showAttendanceScreen) return;

        this.attendanceService.getAttendanceRoster(refreshed.eventId).subscribe({
          next: (roster) => {
            this.roster = roster;
          }
        });
      }
    });
  }
}
