import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { EventService, BackendEvent } from '../services/event.service';
import { HttpClient } from '@angular/common/http';

interface HomepageEventCard {
  id: string;
  title: string;
  location: string;
  dateLabel: string;
  imageUrl: string | null;
  categoryLabel: string;
}

interface CollegeAdminRecord {
  name: string;
  college?: string;
  role: string;
  adminApprovalStatus?: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
}

interface HomepageCollegeCard {
  name: string;
  badge: string;
}

interface DashboardStatsResponse {
  totalAdmins: number;
  totalEvents: number;
  totalStudents: number;
}

interface RegistrationRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './homepage.html',
  styleUrls: ['./homepage.css']
})
export class Homepage implements OnInit, OnDestroy {
  featuredEvents: HomepageEventCard[] = [];
  featuredEventsLoading = true;
  featuredEventsError = '';
  registeredColleges: HomepageCollegeCard[] = [];
  collegesLoading = true;
  activeCollegeIndex = 0;
  activeSection = 'home';
  isDraggingColleges = false;
  platformStats = {
    collegesConnected: 0,
    studentsParticipated: 0,
    eventsHosted: 0,
    totalActiveAdmins: 0
  };

  private readonly sectionIds = ['home', 'events', 'colleges', 'about', 'contacts'];
  private collegeRotationTimer: ReturnType<typeof setInterval> | null = null;
  private dragStartX: number | null = null;
  private dragDeltaX = 0;
  private revealObserver: IntersectionObserver | null = null;

  constructor(
    private eventService: EventService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.updateActiveSection();

    this.http.get<DashboardStatsResponse>('/api/superadmin/dashboard-stats').subscribe({
      next: (dashboardStats) => {
        this.platformStats = {
          ...this.platformStats,
          eventsHosted: dashboardStats.totalEvents || 0,
          totalActiveAdmins: dashboardStats.totalAdmins || 0
        };
        this.cdr.detectChanges();
      }
    });

    this.http.get<RegistrationRecord[]>('/api/registrations').subscribe({
      next: (registrations) => {
        const validRegistrations = registrations.filter((registration) => registration.status !== 'REJECTED');
        this.platformStats = {
          ...this.platformStats,
          studentsParticipated: validRegistrations.length
        };
        this.cdr.detectChanges();
      }
    });

    this.eventService.fetchEvents().subscribe({
      next: (events) => {
        const now = Date.now();
        this.featuredEvents = events
          .filter((event) => {
            if (event.status !== 'Active') {
              return false;
            }

            const eventTime = new Date(event.dateTime).getTime();
            return Number.isNaN(eventTime) || eventTime >= now;
          })
          .slice(0, 6)
          .map((event) => this.toHomepageEventCard(event));
        this.featuredEventsLoading = false;
      },
      error: () => {
        this.featuredEventsError = 'Unable to load featured events right now.';
        this.featuredEventsLoading = false;
      }
    });

    this.http.get<CollegeAdminRecord[]>('/api/superadmin/admin-requests').subscribe({
      next: (records) => {
        const uniqueColleges = Array.from(
          new Set(
            records
              .filter((record) =>
                (record.role === 'college_admin' || record.role === 'admin') &&
                record.adminApprovalStatus === 'approved' &&
                !!record.college?.trim()
              )
              .map((record) => record.college!.trim())
          )
        );

        this.registeredColleges = uniqueColleges.slice(0, 10).map((college) => ({
          name: college,
          badge: this.getCollegeBadge(college)
        }));
        this.platformStats.collegesConnected = uniqueColleges.length;
        this.activeCollegeIndex = 0;
        this.startCollegeRotation();
        this.collegesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.stopCollegeRotation();
        this.collegesLoading = false;
      }
    });

    setTimeout(() => this.setupRevealObserver(), 0);
  }

  ngOnDestroy() {
    this.stopCollegeRotation();
    this.revealObserver?.disconnect();
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  pauseCollegeRotation() {
    this.stopCollegeRotation();
  }

  resumeCollegeRotation() {
    if (this.isDraggingColleges) {
      return;
    }
    this.startCollegeRotation();
  }

  onCollegePointerDown(event: PointerEvent) {
    this.isDraggingColleges = true;
    this.dragStartX = event.clientX;
    this.dragDeltaX = 0;
    this.stopCollegeRotation();
  }

  onCollegePointerMove(event: PointerEvent) {
    if (!this.isDraggingColleges || this.dragStartX === null) {
      return;
    }

    this.dragDeltaX = event.clientX - this.dragStartX;
    this.cdr.detectChanges();
  }

  onCollegePointerUp() {
    if (!this.isDraggingColleges) {
      return;
    }

    const threshold = 50;
    if (this.dragDeltaX <= -threshold) {
      this.moveToNextCollege();
    } else if (this.dragDeltaX >= threshold) {
      this.moveToPreviousCollege();
    }

    this.resetCollegeDrag();
    this.startCollegeRotation();
  }

  getCollegeCardStyle(index: number) {
    const total = this.registeredColleges.length;
    if (total === 0) {
      return { opacity: 0, transform: 'translate(-50%, -50%) scale(0.7)' };
    }

    const viewportWidth = window.innerWidth;
    const totalSafe = Math.max(total, 1);
    const diffRight = (index - this.activeCollegeIndex + totalSafe) % totalSafe;
    const diffLeft = (this.activeCollegeIndex - index + totalSafe) % totalSafe;

    let x = 0;
    let y = viewportWidth < 560 ? -20 : -24;
    let scale = 1.08;
    let opacity = 1;
    let blur = 0;
    let rotateY = 0;
    let zIndex = 5;
    let pointerEvents = 'auto';

    const nearOffset = viewportWidth < 560 ? 122 : viewportWidth < 860 ? 170 : viewportWidth < 1180 ? 205 : 255;
    const farOffset = viewportWidth < 860 ? 0 : viewportWidth < 1180 ? 345 : 470;

    if (diffRight === 1) {
      x = nearOffset;
      y = viewportWidth < 560 ? -18 : -22;
      scale = viewportWidth < 560 ? 0.84 : viewportWidth < 1180 ? 0.88 : 0.9;
      rotateY = -16;
      zIndex = 4;
      opacity = 0.96;
    } else if (diffLeft === 1) {
      x = -nearOffset;
      y = viewportWidth < 560 ? -18 : -22;
      scale = viewportWidth < 560 ? 0.84 : viewportWidth < 1180 ? 0.88 : 0.9;
      rotateY = 16;
      zIndex = 4;
      opacity = 0.96;
    } else if (farOffset && diffRight === 2) {
      x = farOffset;
      y = viewportWidth < 560 ? -16 : -20;
      scale = viewportWidth < 1180 ? 0.75 : 0.76;
      rotateY = -22;
      zIndex = 3;
      opacity = 0.72;
      blur = 0.2;
    } else if (farOffset && diffLeft === 2) {
      x = -farOffset;
      y = viewportWidth < 560 ? -16 : -20;
      scale = viewportWidth < 1180 ? 0.75 : 0.76;
      rotateY = 22;
      zIndex = 3;
      opacity = 0.72;
      blur = 0.2;
    } else if (diffRight === 0) {
      x = 0;
      y = viewportWidth < 560 ? -36 : -46;
    } else {
      scale = 0.72;
      opacity = 0;
      blur = 2;
      zIndex = 1;
      pointerEvents = 'none';
    }

    return {
      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale}) rotateY(${rotateY}deg)`,
      opacity: `${opacity}`,
      filter: `blur(${blur}px)`,
      zIndex: `${zIndex}`,
      pointerEvents
    };
  }

  @HostListener('window:hashchange')
  onHashChange() {
    this.updateActiveSection();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.updateActiveSectionFromScroll();
  }

  private updateActiveSection() {
    const hash = window.location.hash.replace('#', '');
    this.activeSection = this.sectionIds.includes(hash) ? hash : 'home';
  }

  private updateActiveSectionFromScroll() {
    const offset = 180;

    for (const sectionId of this.sectionIds.slice(1).reverse()) {
      const section = document.getElementById(sectionId);

      if (!section) {
        continue;
      }

      const top = section.getBoundingClientRect().top;
      if (top <= offset) {
        this.activeSection = sectionId;
        return;
      }
    }

    this.activeSection = 'home';
  }

  private toHomepageEventCard(event: BackendEvent): HomepageEventCard {
    const date = event.dateTime ? new Date(event.dateTime) : null;

    return {
      id: String(event.id),
      title: event.name,
      location: event.location,
      dateLabel: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : event.dateTime,
      imageUrl: event.posterDataUrl,
      categoryLabel: (event.category || 'Event').trim().charAt(0).toUpperCase() || 'E'
    };
  }

  private getCollegeBadge(collegeName: string): string {
    return collegeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  private startCollegeRotation() {
    if (this.collegeRotationTimer || this.registeredColleges.length <= 1) {
      return;
    }

    this.collegeRotationTimer = setInterval(() => {
      this.moveToNextCollege();
    }, 2200);
  }

  private stopCollegeRotation() {
    if (this.collegeRotationTimer) {
      clearInterval(this.collegeRotationTimer);
      this.collegeRotationTimer = null;
    }
  }

  private moveToNextCollege() {
    this.activeCollegeIndex = (this.activeCollegeIndex + 1) % this.registeredColleges.length;
    this.cdr.detectChanges();
  }

  private moveToPreviousCollege() {
    this.activeCollegeIndex =
      (this.activeCollegeIndex - 1 + this.registeredColleges.length) % this.registeredColleges.length;
    this.cdr.detectChanges();
  }

  private resetCollegeDrag() {
    this.isDraggingColleges = false;
    this.dragStartX = null;
    this.dragDeltaX = 0;
  }

  private setupRevealObserver() {
    this.revealObserver?.disconnect();

    const sections = document.querySelectorAll('.reveal-section');
    if (!sections.length) {
      return;
    }

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px'
      }
    );

    sections.forEach((section) => this.revealObserver?.observe(section));
  }
}
