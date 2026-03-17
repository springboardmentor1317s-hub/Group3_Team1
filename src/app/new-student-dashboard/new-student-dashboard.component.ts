import { Component, ElementRef, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subscription, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { EventService, BackendEvent } from '../services/event.service';
import { AuthService } from '../services/auth.service';

export interface StatCard {
  title: string;
  value: number;
  icon: string;
  color: string;
  subtitle: string;
  variant?: 'primary' | 'success' | 'warning';
}

export interface Event {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  category: string;
  attendees: number;
  maxAttendees: number;
  status: 'Open' | 'Registered' | 'Full' | 'Closed';
  description: string;
  registered: boolean;
  organizer?: string;
  contact?: string;
  posterUrl?: string | null;
  college?: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
}

export interface CalendarEvent {
  eventId: number;
  title: string;
  date: string;
  time: string;
  location: string;
  addedToCalendar: boolean;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  eventName: string;
  studentId: string;
  studentName: string;
  email: string;
  college: string;
  submittedDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

@Component({
  selector: 'app-new-student-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './new-student-dashboard.html',
  styleUrls: ['./new-student-dashboard.css']
})
export class NewStudentDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('profileImageInput') private profileImageInput?: ElementRef<HTMLInputElement>;

  private subscriptions: Subscription[] = [];
  private readonly REGISTRATION_API_URL = '/api/registrations';
readonly dashboardCoverUrl = '/assets/student-dashboard-cover.png';
  
  isLoading = false;
  errorMessage = '';

  sidebarOpen = false;
  activeTab: string = 'dashboard';
  activeSubPage: string = '';
  profileImageUrl: string | null = null;
  
  // Student Information
  studentName = '';
  studentId = '';
  department = '';
  email = '';
  phone = '';
  address = '';
  
  // Search Queries
  searchQuery = '';
  globalSearchQuery = '';
  selectedDate = '';
  selectedCollege = 'All Colleges';
  appliedSearchQuery = '';
  appliedSelectedCategory = 'All';
  appliedSelectedDate = '';
  appliedSelectedCollege = 'All Colleges';
  
  // Registration tracking
  private studentRegistrations: EventRegistration[] = [];
  private seenNotifications: Set<string> = new Set();
  private registrationPollSubscription?: Subscription;
  
  // Edit Profile Form
  editProfileForm = {
    name: '',
    email: '',
    phone: '',
    address: '',
    bio: ''
  };
  
  // Settings Form
  settingsForm = {
    emailNotifications: true,
    smsNotifications: false,
    eventReminders: true,
    marketingEmails: false,
    language: 'en',
    timezone: 'UTC-5',
    theme: 'light'
  };
  
  // Change Password Form
  changePasswordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  // Navigation
  menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'events', label: 'Browse Events', icon: 'event' },
    { id: 'registrations', label: 'My Registrations', icon: 'assignment' },
    { id: 'calendar', label: 'Event Calendar', icon: 'calendar_month' },
    { id: 'history', label: 'Event History', icon: 'history' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications', badge: 3 },
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'logout', label: 'Logout', icon: 'logout' }
  ];

  referenceStats = [
    { icon: 'event', count: '12', title: 'Upcoming Events' },
    { icon: 'assignment', count: '3', title: 'My Registrations' },
    { icon: 'celebration', count: '8', title: 'Participated Events' },
    { icon: 'pending_actions', count: '2', title: 'Pending Approval' }
  ];

  notifications: Notification[] = [];
  upcomingEvents: Event[] = [];
  myRegistrations: Event[] = [];
  calendarEvents: CalendarEvent[] = [];
  eventCategories = ['All', 'Technology', 'Cultural', 'Workshop', 'Career', 'Sports', 'Seminar'];
  selectedCategory = 'All';

  // Calendar
  currentDate = new Date();
  currentMonthYear = '';
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarDays: any[] = [];

  // History
  historyFilter: 'all' | 'attended' | 'missed' = 'all';
  eventHistory: any[] = [];

  constructor(
    private eventService: EventService,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // Load user info
    const currentUser = this.authService.currentUserValue;
    if (currentUser) {
      this.studentName = currentUser.name || 'Student';
      this.studentId = currentUser.userId || '';
      this.email = currentUser.email || '';
      this.department = currentUser.college || 'Not Set';
      this.phone = 'Not Set';
      this.address = 'Not Set';
    }

    // Load seen notifications
    const seen = localStorage.getItem('seenNotifications');
    if (seen) {
      this.seenNotifications = new Set(JSON.parse(seen));
    }

    this.loadEvents();
    this.updateMonthYear();
    this.generateCalendar();
    this.generateNotifications();
    this.loadCalendarEvents();
    this.loadEventHistory([]);
    this.updateAllStats();
    this.startRegistrationPolling();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.registrationPollSubscription?.unsubscribe();
  }

  // Template Methods - Events & Filters
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  viewEventDetails(event: Event): void {
    alert(`Event: ${event.title}\nDate: ${event.date}\nLocation: ${event.location}`);
  }

  getEventStatusColor(event: Event): string {
    const eventDate = new Date(event.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) return '#4b5563';
    const colors = { Open: '#10b981', Registered: '#3b82f6', Full: '#ef4444', Closed: '#4b5563' };
    return colors[event.status as keyof typeof colors] || '#6b7280';
  }

  getEventStatusText(event: Event): string {
    const eventDate = new Date(event.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) return 'Closed';
    return event.status;
  }

  getEventPosterImage(event: Event): string {
    return event.posterUrl || this.dashboardCoverUrl;
  }

  getCategoryColor(category: string): string {
    const colors = {
      'Technology': '#3b82f6',
      'Cultural': '#ec4899',
      'Workshop': '#8b5cf6',
      'Career': '#10b981',
      'Sports': '#f59e0b',
      'Seminar': '#06b6d4'
    };
    return colors[category as keyof typeof colors] || '#3b82f6';
  }

  filterByCategory(category: string): void {
    this.selectedCategory = category;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'All';
    this.selectedDate = '';
    this.selectedCollege = 'All Colleges';
    this.applyFilters();
  }

  applyFilters(): void {
    // Filter logic
    let filtered = [...this.upcomingEvents];
    if (this.searchQuery) {
      filtered = filtered.filter(e => 
        e.title.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    if (this.selectedCategory !== 'All') {
      filtered = filtered.filter(e => e.category === this.selectedCategory);
    }
    this.myRegistrations = filtered.filter(e => this.getRegistrationStatus(e.id) !== null);
  }

  getFilteredEvents(): Event[] {
    return this.upcomingEvents.filter(e => {
      if (this.searchQuery && !e.title.toLowerCase().includes(this.searchQuery.toLowerCase())) return false;
      if (this.selectedCategory !== 'All' && e.category !== this.selectedCategory) return false;
      return true;
    });
  }

  getRegistrationStatus(eventId: number): 'PENDING' | 'APPROVED' | 'REJECTED' | null {
    const reg = this.studentRegistrations.find(r => parseInt(r.eventId) === eventId);
    return reg ? reg.status as any : null;
  }

  getRegistrationBadgeClass(eventId: number): string {
    const status = this.getRegistrationStatus(eventId);
    const classes = {
      'APPROVED': 'status-approved',
      'PENDING': 'status-pending', 
      'REJECTED': 'status-rejected',
      default: 'status-registered'
    };
    return classes[status || 'default'] as string;
  }

  getRegistrationBadgeText(eventId: number): string {
    const status = this.getRegistrationStatus(eventId);
    switch(status) {
      case 'APPROVED': return 'Approved';
      case 'PENDING': return 'Pending';
      case 'REJECTED': return 'Rejected';
      default: return 'Register';
    }
  }

  getRegistrationButtonConfig(event: Event): { text: string; class: string } | null {
    const status = this.getRegistrationStatus(event.id);
    const eventDate = new Date(event.date);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (eventDate < today) return { text: 'Closed', class: 'btn-closed' };
    
    if (status === 'APPROVED') return { text: 'Approved', class: 'btn-approved' };
    if (status === 'PENDING') return { text: 'Pending', class: 'btn-pending' };
    if (status === 'REJECTED') return { text: 'Rejected', class: 'btn-rejected' };
    if (event.status === 'Full') return { text: 'Full', class: 'btn-full' };
    
    return { text: 'Register', class: 'btn-register' };
  }

  registerForEvent(event: Event): void {
    const config = this.getRegistrationButtonConfig(event);
    if (!config || config.text === 'Full' || config.class.includes('pending')) {
      alert(`Cannot register: ${config?.text}`);
      return;
    }
    
    const currentUser = this.authService.currentUserValue;
    if (!currentUser) {
      alert('Please log in first.');
      return;
    }

    const registrationData = {
      eventId: String(event.id),
      eventName: event.title,
      studentId: currentUser.userId,
      studentName: currentUser.name,
      email: currentUser.email,
      college: currentUser.college
    };

    this.http.post(this.REGISTRATION_API_URL, registrationData).subscribe({
      next: () => {
        alert(`Registration submitted for "${event.title}"`);
        this.loadEvents();
        this.refreshStudentRegistrationsNow();
      },
      error: (err) => alert('Registration failed: ' + (err.error?.message || 'Unknown error'))
    });
  }

  addToCalendar(event: Event): void {
    alert(`Added "${event.title}" to your calendar!`);
  }

  cancelRegistration(event: Event): void {
    if (confirm(`Cancel registration for "${event.title}"?`)) {
      alert(`Registration cancelled for "${event.title}"`);
      this.loadEvents();
    }
  }

  // Calendar Methods
  previousMonth(): void {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.updateMonthYear();
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.updateMonthYear();
    this.generateCalendar();
  }

  updateMonthYear(): void {
    this.currentMonthYear = this.currentDate.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  }

  generateCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    this.calendarDays = [];
    
    // Previous month days
    for (let i = firstDay; i > 0; i--) {
      const date = new Date(year, month, 1 - i);
      this.calendarDays.push({
        date: date.getDate(),
        fullDate: date.toISOString().split('T')[0],
        isCurrentMonth: false,
        isToday: false,
        events: []
      });
    }
    
    // Current month days
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      
      this.calendarDays.push({
        date: day,
        fullDate: dateStr,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        events: this.upcomingEvents.filter(e => e.date === dateStr)
      });
    }
  }

  loadCalendarEvents(): void {
    this.calendarEvents = this.upcomingEvents.map(e => ({
      eventId: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      location: e.location,
      addedToCalendar: false
    }));
  }

  // History Methods
  getDay(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'short' });
  }

  getMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  getAttendedEvents(): any[] {
    return this.eventHistory.filter(item => item.attended);
  }

  getMissedEvents(): any[] {
    return this.eventHistory.filter(item => !item.attended);
  }

  getFilteredHistory(): any[] {
    switch (this.historyFilter) {
      case 'attended': return this.getAttendedEvents();
      case 'missed': return this.getMissedEvents();
      default: return this.eventHistory;
    }
  }

  loadEventHistory(events: BackendEvent[]): void {
    // Mock history data
    this.eventHistory = [
      { 
        event: { 
          id: 1, 
          title: 'AI Hackathon', 
          date: '2024-10-15', 
          category: 'Technology', 
          time: '14:00', 
          location: 'Auditorium',
          description: 'Participated successfully!'
        }, 
        attended: true 
      },
      { 
        event: { 
          id: 2, 
          title: 'Cultural Fest', 
          date: '2024-09-28', 
          category: 'Cultural', 
          time: '19:00', 
          location: 'Main Hall',
          description: 'Missed due to exam'
        }, 
        attended: false 
      }
    ];
  }

  // Notification Methods
  generateNotifications(): void {
    this.notifications = [
      { 
        id: 1, 
        title: 'Registration Approved', 
        message: 'Tech Workshop registration approved!', 
        time: '2 mins ago', 
        type: 'success', 
        read: false 
      },
      { 
        id: 2, 
        title: 'Event Reminder', 
        message: 'Cultural Fest tomorrow at 10 AM', 
        time: '1 hr ago', 
        type: 'info', 
        read: true 
      }
    ];
  }

  markNotificationAsRead(notification: Notification): void {
    notification.read = true;
    this.updateNotificationBadge();
  }

  updateNotificationBadge(): void {
    const unreadCount = this.notifications.filter(n => !n.read).length;
    const notificationsMenu = this.menuItems.find(m => m.id === 'notifications');
    if (notificationsMenu) {
      notificationsMenu.badge = unreadCount;
    }
  }

  getUnreadNotificationsCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  // Profile & Settings Methods
  onProfileImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profileImageUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  openProfileImagePicker(): void {
    this.profileImageInput?.nativeElement.click();
  }

  openEditProfile(): void {
    this.activeSubPage = 'edit-profile';
    this.editProfileForm = {
      name: this.studentName,
      email: this.email,
      phone: this.phone,
      address: this.address,
      bio: ''
    };
  }

  saveProfile(): void {
    this.studentName = this.editProfileForm.name;
    this.email = this.editProfileForm.email;
    this.phone = this.editProfileForm.phone;
    this.address = this.editProfileForm.address;
    this.activeSubPage = '';
    alert('Profile updated successfully!');
  }

  cancelEditProfile(): void {
    this.activeSubPage = '';
  }

  openSettings(): void {
    this.activeSubPage = 'settings';
  }

  saveSettings(): void {
    localStorage.setItem('userSettings', JSON.stringify(this.settingsForm));
    this.activeSubPage = '';
    alert('Settings saved!');
  }

  cancelSettings(): void {
    this.activeSubPage = '';
  }

  openChangePassword(): void {
    this.activeSubPage = 'change-password';
  }

  changePassword(): void {
    if (this.changePasswordForm.newPassword === this.changePasswordForm.confirmPassword) {
      alert('Password changed successfully!');
      this.activeSubPage = '';
      this.changePasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    } else {
      alert('Passwords do not match!');
    }
  }

  cancelChangePassword(): void {
    this.activeSubPage = '';
    this.changePasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  }

  // Utility Methods
  getCollegeOptions(): string[] {
    return ['All Colleges', 'Engineering College', 'Arts College', 'Science College'];
  }

  updateAllStats(): void {
    this.referenceStats[0].count = this.upcomingEvents.length.toString();
    this.referenceStats[1].count = this.myRegistrations.length.toString();
    this.referenceStats[2].count = this.getAttendedEvents().length.toString();
    this.referenceStats[3].count = this.studentRegistrations.filter(r => r.status === 'PENDING').length.toString();
  }

  // Registration Polling
  private startRegistrationPolling(): void {
    this.registrationPollSubscription = timer(0, 30000)
      .pipe(switchMap(() => this.fetchStudentRegistrations()))
      .subscribe(registrations => {
        this.studentRegistrations = registrations;
        this.updateRegistrations();
        this.updateAllStats();
        this.generateNotifications();
      });
  }

  private refreshStudentRegistrationsNow(): void {
    this.fetchStudentRegistrations().subscribe({
      next: (registrations) => {
        this.studentRegistrations = registrations;
        this.updateRegistrations();
        this.updateAllStats();
        this.generateNotifications();
      },
      error: () => {}
    });
  }

  private fetchStudentRegistrations() {
    const currentUser = this.authService.currentUserValue;
    if (!currentUser?.userId) return of([]);
    return this.http.get<EventRegistration[]>(`${this.REGISTRATION_API_URL}/student/${currentUser.userId}`);
  }

  private updateRegistrations(): void {
    const activeIds = new Set(this.studentRegistrations
      .filter(r => ['APPROVED', 'PENDING'].includes(r.status))
      .map(r => r.eventId));
    this.myRegistrations = this.upcomingEvents.filter(e => activeIds.has(String(e.id)));
  }

  loadEvents(): void {
    this.isLoading = true;
    this.eventService.fetchEvents().subscribe({
      next: (backendEvents: BackendEvent[]) => {
        this.upcomingEvents = backendEvents
          .filter(e => e.status === 'Active')
          .map(e => this.eventService.convertToFrontendEvent(e) as Event);
        this.updateAllStats();
        this.updateRegistrations();
        this.loadEventHistory(backendEvents);
        this.loadCalendarEvents();
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load events';
        this.isLoading = false;
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
    this.activeSubPage = '';
    if (window.innerWidth < 1024) this.sidebarOpen = false;
  }

  isNavTabActive(tabId: string): boolean {
    return this.activeTab === tabId;
  }

  handleLogout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }
}

