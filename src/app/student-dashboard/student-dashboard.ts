import { Component, ElementRef, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { EventService, BackendEvent } from '../services/event.service';
import { AuthService } from '../services/auth.service';

export interface StatCard {
  title: string;
  value: number;
  icon: string;
  color: string;
  subtitle: string;
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

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './student-dashboard.html',
  styleUrls: ['./student-dashboard.css']
})
export class StudentDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('profileImageInput') private profileImageInput?: ElementRef<HTMLInputElement>;

  private subscriptions: Subscription[] = [];
  isLoading = false;
  errorMessage = '';

  sidebarOpen = false;
  activeTab = 'dashboard';
  activeSubPage = '';
  profileImageUrl: string | null = null;
  
  // Student Information - Will be loaded from auth service
  studentName = '';
  studentId = '';
  department = '';
  email = '';
  phone = '';
  address = '';
  
  // Search Queries
  searchQuery = '';
  globalSearchQuery = '';
  
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

  stats: StatCard[] = [
    {
      title: 'Upcoming Events',
      value: 0,
      icon: 'event_upcoming',
      color: '#3b82f6',
      subtitle: 'Events this month'
    },
    {
      title: 'My Registrations',
      value: 0,
      icon: 'assignment_turned_in',
      color: '#8b5cf6',
      subtitle: 'Active registrations'
    },
    {
      title: 'Events Attended',
      value: 0,
      icon: 'check_circle',
      color: '#10b981',
      subtitle: 'Total attended'
    },
    {
      title: 'Pending Actions',
      value: 0,
      icon: 'pending_actions',
      color: '#f59e0b',
      subtitle: 'Awaiting confirmation'
    }
  ];

  notifications: Notification[] = [];

  upcomingEvents: Event[] = [];
  myRegistrations: Event[] = [];
  calendarEvents: CalendarEvent[] = [];
  eventCategories = ['All', 'Technology', 'Cultural', 'Workshop', 'Career', 'Sports', 'Seminar'];
  selectedCategory = 'All';

  // Calendar properties
  currentDate = new Date();
  currentMonthYear = '';
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarDays: any[] = [];

  // Event History
  historyFilter: 'all' | 'attended' | 'missed' = 'all';
  eventHistory: any[] = [];

  constructor(
    private eventService: EventService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Load user info from auth service
    const currentUser = this.authService.currentUserValue;
    if (currentUser) {
      this.studentName = currentUser.name || 'Student';
      this.studentId = currentUser.userId || '';
      this.email = currentUser.email || '';
      this.department = currentUser.college || 'Not Set';
      // Phone and address would need to be added to User model in backend
      this.phone = 'Not Set';
      this.address = 'Not Set';
    } else {
      // If no user logged in, redirect to login
      console.warn('No user logged in');
      // Uncomment below to force login
      // window.location.href = '/login';
    }

    // Fetch events from backend
    this.loadEvents();
    
    // Subscribe to registrations to generate notifications
    const regSub = this.eventService.registrations$.subscribe((registrations: string[]) => {
      this.updateRegistrations();
      this.generateNotifications();
    });
    this.subscriptions.push(regSub);

    this.generateCalendar();
    this.updateMonthYear();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Load events from MongoDB
  loadEvents(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    const eventSub = this.eventService.fetchEvents().subscribe({
      next: (backendEvents: BackendEvent[]) => {
        // Convert backend events to frontend format
        this.upcomingEvents = backendEvents
          .filter((e: BackendEvent) => e.status === 'Active')
          .map((e: BackendEvent) => this.eventService.convertToFrontendEvent(e));
        
        // Load past events for history
        this.loadEventHistory(backendEvents);
        
        // Update all stats
        this.updateAllStats();
        
        // Update registrations
        this.updateRegistrations();
        
        // Generate notifications for registered events
        this.generateNotifications();
        
        // Load calendar events
        this.loadCalendarEvents();
        
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading events:', error);
        this.errorMessage = 'Failed to load events. Please try again later.';
        this.isLoading = false;
      }
    });
    
    this.subscriptions.push(eventSub);
  }

  // Load event history from past events
  loadEventHistory(backendEvents: BackendEvent[]): void {
    const pastEvents = backendEvents.filter((e: BackendEvent) => e.status === 'Past');
    const registeredEventIds = this.eventService.getCurrentRegistrations();
    
    this.eventHistory = pastEvents.map((e: BackendEvent) => {
      const frontendEvent = this.eventService.convertToFrontendEvent(e);
      const wasRegistered = registeredEventIds.includes(e.id);
      
      return {
        event: {
          id: frontendEvent.id,
          title: frontendEvent.title,
          date: frontendEvent.date,
          time: frontendEvent.time,
          location: frontendEvent.location,
          category: frontendEvent.category,
          description: frontendEvent.description
        },
        attended: wasRegistered, // If they were registered, assume they attended
        rating: wasRegistered ? Math.floor(Math.random() * 2) + 4 : null // Random rating 4-5 for attended events
      };
    });
  }

  // Update all statistics from real data
  updateAllStats(): void {
    // Upcoming Events
    this.stats[0].value = this.upcomingEvents.length;
    
    // My Registrations
    const registeredCount = this.upcomingEvents.filter(e => e.registered).length;
    this.stats[1].value = registeredCount;
    
    // Events Attended (from history)
    const attendedCount = this.eventHistory.filter(item => item.attended).length;
    this.stats[2].value = attendedCount;
    if (this.eventHistory.length > 0) {
      const percentage = Math.round((attendedCount / this.eventHistory.length) * 100);
      this.stats[2].subtitle = `${percentage}% attendance rate`;
    } else {
      this.stats[2].subtitle = 'No past events';
    }
    
    // Pending Actions (events happening in next 7 days that user is registered for)
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    const pendingEvents = this.upcomingEvents.filter(event => {
      if (!event.registered) return false;
      const eventDate = new Date(event.date);
      return eventDate >= today ;
    });
    this.stats[3].value = pendingEvents.length;
    this.stats[3].subtitle = pendingEvents.length === 0 ? 'All clear' : 'Events this week';
  }

  // Generate notifications for registered events
  generateNotifications(): void {
    this.notifications = [];
    let notificationId = 1;
    
    // Get registered events
    const registeredEvents = this.upcomingEvents.filter(e => e.registered);
    
    // Create notification for each registered event
    registeredEvents.forEach(event => {
      const eventDate = new Date(event.date);
      const today = new Date();
      const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      let message = '';
      let type: 'info' | 'warning' | 'success' = 'info';
      let time = '';
      
      if (daysUntil <= 0) {
        message = `${event.title} is happening today at ${event.time}!`;
        type = 'warning';
        time = 'Today';
      } else if (daysUntil === 1) {
        message = `${event.title} is tomorrow at ${event.time}. Don't forget to attend!`;
        type = 'warning';
        time = 'Tomorrow';
      } else if (daysUntil <= 3) {
        message = `${event.title} is in ${daysUntil} days at ${event.time}`;
        type = 'info';
        time = `${daysUntil} days away`;
      } else if (daysUntil <= 7) {
        message = `Upcoming: ${event.title} on ${event.date} at ${event.time}`;
        type = 'info';
        time = `${daysUntil} days away`;
      } else {
        message = `You're registered for ${event.title} on ${event.date}`;
        type = 'success';
        time = `${daysUntil} days away`;
      }
      
      this.notifications.push({
        id: notificationId++,
        title: `Event Reminder: ${event.title}`,
        message: message,
        time: time,
        type: type,
        read: false
      });
    });
    
    // Sort notifications by urgency (warnings first, then info, then success)
    this.notifications.sort((a, b) => {
      const order = { warning: 0, info: 1, success: 2 };
      return order[a.type] - order[b.type];
    });
    
    // Update notification badge
    this.updateNotificationBadge();
  }

  updateRegistrations(): void {
    this.myRegistrations = this.upcomingEvents.filter(event => event.registered);
    this.updateAllStats();
    this.generateNotifications();
  }

  // Navigation Methods
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
    this.activeSubPage = '';
    if (window.innerWidth < 1024) {
      this.sidebarOpen = false;
    }
  }

  // Enhanced Global Search Method with Smart Navigation
  performGlobalSearch(): void {
    if (!this.globalSearchQuery.trim()) {
      return;
    }
    
    const searchTerm = this.globalSearchQuery.toLowerCase().trim();
    
    // Smart Navigation - Check for page keywords first
    const pageKeywords: { [key: string]: string[] } = {
      'dashboard': ['dashboard', 'home', 'main'],
      'events': ['events', 'browse events', 'all events', 'event'],
      'registrations': ['registrations', 'my registrations', 'registered', 'registration'],
      'calendar': ['calendar', 'schedule', 'dates'],
      'history': ['history', 'past events', 'attended', 'missed'],
      'notifications': ['notifications', 'alerts', 'updates', 'notification'],
      'profile': ['profile', 'account', 'settings', 'my profile'],
      'logout': ['logout', 'sign out', 'log out']
    };
    
    // Check if search matches a page keyword
    for (const [page, keywords] of Object.entries(pageKeywords)) {
      if (keywords.some(keyword => searchTerm.includes(keyword))) {
        this.setActiveTab(page);
        this.globalSearchQuery = '';
        this.searchQuery = '';
        return;
      }
    }
    
    // If no page match, search within events
    this.activeTab = 'events';
    this.activeSubPage = '';
    this.searchQuery = this.globalSearchQuery;
    this.selectedCategory = 'All';
    
    if (window.innerWidth < 1024) {
      this.sidebarOpen = false;
    }
    
    setTimeout(() => {
      const searchInput = document.querySelector('.search-box input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }

  // Profile Methods
  openEditProfile(): void {
    this.activeSubPage = 'edit-profile';
    this.editProfileForm = {
      name: this.studentName,
      email: this.email,
      phone: this.phone,
      address: this.address,
      bio: 'Passionate computer science student interested in AI and web development.'
    };
  }

  saveProfile(): void {
    this.studentName = this.editProfileForm.name;
    this.email = this.editProfileForm.email;
    this.phone = this.editProfileForm.phone;
    this.address = this.editProfileForm.address;
    
    alert('Profile updated successfully!');
    this.activeSubPage = '';
  }

  cancelEditProfile(): void {
    this.activeSubPage = '';
  }

  openSettings(): void {
    this.activeSubPage = 'settings';
  }

  saveSettings(): void {
    alert('Settings saved successfully!');
    this.activeSubPage = '';
  }

  cancelSettings(): void {
    this.activeSubPage = '';
  }

  openChangePassword(): void {
    this.activeSubPage = 'change-password';
  }

  changePassword(): void {
    if (this.changePasswordForm.newPassword !== this.changePasswordForm.confirmPassword) {
      alert('New passwords do not match!');
      return;
    }
    
    if (this.changePasswordForm.newPassword.length < 8) {
      alert('Password must be at least 8 characters long!');
      return;
    }
    
    alert('Password changed successfully!');
    this.changePasswordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    this.activeSubPage = '';
  }

  cancelChangePassword(): void {
    this.changePasswordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    this.activeSubPage = '';
  }

  // Event Registration Methods
  registerForEvent(event: Event): void {
    if (event.status === 'Full') return;
    
    event.registered = !event.registered;
    
    if (event.registered) {
      // Register in service
      this.eventService.registerForEvent(event.id.toString());
      event.status = 'Registered';
      alert(`Successfully registered for: ${event.title}`);
    } else {
      // Unregister in service
      this.eventService.unregisterFromEvent(event.id.toString());
      event.status = 'Open';
      alert(`Registration cancelled for: ${event.title}`);
    }
    
    this.updateRegistrations();
  }

  cancelRegistration(event: Event): void {
    if (confirm(`Are you sure you want to cancel your registration for "${event.title}"?`)) {
      event.registered = false;
      event.status = 'Open';
      this.eventService.unregisterFromEvent(event.id.toString());
      
      // Remove from calendar if added
      this.calendarEvents = this.calendarEvents.filter(ce => ce.eventId !== event.id);
      
      this.updateRegistrations();
      alert('Registration cancelled successfully!');
    }
  }

  viewEventDetails(event: Event): void {
    const organizer = event.organizer ? `\nOrganizer: ${event.organizer}` : '';
    const contact = event.contact ? `\nContact: ${event.contact}` : '';
    alert(`Event Details:\n\nTitle: ${event.title}\nDate: ${event.date}\nTime: ${event.time}\nLocation: ${event.location}${organizer}${contact}\nDescription: ${event.description}\nAttendees: ${event.attendees}/${event.maxAttendees}`);
  }

  // Add to Calendar Methods
  addToCalendar(event: Event): void {
    const calendarEvent: CalendarEvent = {
      eventId: event.id,
      title: event.title,
      date: event.date,
      time: event.time,
      location: event.location,
      addedToCalendar: true
    };
    
    const exists = this.calendarEvents.find(ce => ce.eventId === event.id);
    if (!exists) {
      this.calendarEvents.push(calendarEvent);
    }
    
    this.downloadICSFile(event);
    
    alert(
      `"${event.title}" ${exists ? 'is already marked in your dashboard calendar' : 'has been added to your calendar'}.\n\nA .ics file was downloaded. Import it into Google Calendar, Outlook, or Apple Calendar to add the event.`
    );
  }

  openProfileImagePicker(): void {
    this.profileImageInput?.nativeElement.click();
  }

  onProfileImageSelected(event: globalThis.Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.profileImageUrl = typeof reader.result === 'string' ? reader.result : null;
    };
    reader.readAsDataURL(file);
  }

  downloadICSFile(event: Event): void {
    // Parse the date string properly
    const [year, month, day] = event.date.split('-').map(num => parseInt(num));
    const [timeStr, period] = event.time.split(' ');
    const [hours, minutes] = timeStr.split(':').map(num => parseInt(num));
    
    // Convert to 24-hour format
    let hour24 = hours;
    if (period === 'PM' && hours !== 12) {
      hour24 = hours + 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }
    
    // Create date in local timezone
    const startDate = new Date(year, month - 1, day, hour24, minutes, 0);
    const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CampusEventHub//Event//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${event.id}@campuseventhub.com
DTSTAMP:${this.formatICSDate(new Date())}
DTSTART:${this.formatICSDate(startDate)}
DTEND:${this.formatICSDate(endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description.replace(/\n/g, '\\n')}
LOCATION:${event.location}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  formatICSDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  }

  loadCalendarEvents(): void {
    this.myRegistrations.forEach(event => {
      const exists = this.calendarEvents.find(ce => ce.eventId === event.id);
      if (!exists) {
        this.calendarEvents.push({
          eventId: event.id,
          title: event.title,
          date: event.date,
          time: event.time,
          location: event.location,
          addedToCalendar: true
        });
      }
    });
  }

  // Search and Filter Methods
  filterByCategory(category: string): void {
    this.selectedCategory = category;
    this.searchQuery = '';
    this.globalSearchQuery = '';
  }

  getFilteredEvents(): Event[] {
    let filtered = this.upcomingEvents;
    
    if (this.selectedCategory !== 'All') {
      filtered = filtered.filter(event => event.category === this.selectedCategory);
    }
    
    if (this.searchQuery && this.searchQuery.trim()) {
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        event.category.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        event.description.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }

  getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      'Technology': '#3b82f6',
      'Cultural': '#ec4899',
      'Workshop': '#8b5cf6',
      'Career': '#10b981',
      'Sports': '#f59e0b',
      'Seminar': '#06b6d4'
    };
    return colors[category] || '#3b82f6';
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'Open': '#10b981',
      'Registered': '#3b82f6',
      'Full': '#ef4444',
      'Closed': '#6b7280'
    };
    return colors[status] || '#6b7280';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Notification Methods
  markNotificationAsRead(notification: Notification): void {
    notification.read = true;
    this.updateNotificationBadge();
  }

  getUnreadNotificationsCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  updateNotificationBadge(): void {
    const notifItem = this.menuItems.find(item => item.id === 'notifications');
    if (notifItem) {
      notifItem.badge = this.getUnreadNotificationsCount();
    }
  }

  // Calendar Methods
  generateCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    this.calendarDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      // const dateStr = date.toISOString().split('T')[0];
      const year = date.getFullYear();
      const monthNumber = date.getMonth(); 
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const dayEvents = this.upcomingEvents.filter(event => event.date === dateStr);
      
      const isToday = date.getTime() === today.getTime();
      
      this.calendarDays.push({
        date: date.getDate(),
        fullDate: dateStr,
        // isCurrentMonth: date.getMonth() === month,
        isCurrentMonth: monthNumber === this.currentDate.getMonth(),
        isToday: isToday,
        events: dayEvents
      });
    }
  }

  updateMonthYear(): void {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    this.currentMonthYear = `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  previousMonth(): void {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.generateCalendar();
    this.updateMonthYear();
  }

  nextMonth(): void {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.generateCalendar();
    this.updateMonthYear();
  }

  // Event History Methods
  getFilteredHistory(): any[] {
    if (this.historyFilter === 'attended') {
      return this.eventHistory.filter(item => item.attended);
    } else if (this.historyFilter === 'missed') {
      return this.eventHistory.filter(item => !item.attended);
    }
    return this.eventHistory;
  }

  getAttendedEvents(): any[] {
    return this.eventHistory.filter(item => item.attended);
  }

  getMissedEvents(): any[] {
    return this.eventHistory.filter(item => !item.attended);
  }

  getDay(dateString: string): string {
    const date = new Date(dateString);
    return date.getDate().toString().padStart(2, '0');
  }

  getMonth(dateString: string): string {
    const date = new Date(dateString);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                   'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[date.getMonth()];
  }

  // Logout Methods
  handleLogout(): void {
    this.authService.logout();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  }

  cancelLogout(): void {
    this.activeTab = 'dashboard';
  }
}