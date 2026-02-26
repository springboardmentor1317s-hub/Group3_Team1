import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './student-dashboard.html',
  styleUrls: ['./student-dashboard.css']
})
export class StudentDashboardComponent implements OnInit {
  @ViewChild('profileImageInput') private profileImageInput?: ElementRef<HTMLInputElement>;

  sidebarOpen = false;
  activeTab = 'dashboard';
  activeSubPage = ''; // For nested pages like 'edit-profile', 'settings', 'change-password'
  profileImageUrl: string | null = null;
  
  // Student Information
  studentName = 'John Doe';
  studentId = 'STU2024001';
  department = 'Computer Science';
  email = 'john.doe@university.edu';
  phone = '+1 234 567 8900';
  address = '123 University Ave, City, State 12345';
  
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
      value: 12,
      icon: 'event_upcoming',
      color: '#3b82f6',
      subtitle: 'Events this month'
    },
    {
      title: 'My Registrations',
      value: 2,
      icon: 'assignment_turned_in',
      color: '#8b5cf6',
      subtitle: 'Active registrations'
    },
    {
      title: 'Events Attended',
      value: 8,
      icon: 'check_circle',
      color: '#10b981',
      subtitle: '67% attendance rate'
    },
    {
      title: 'Pending Actions',
      value: 2,
      icon: 'pending_actions',
      color: '#f59e0b',
      subtitle: 'Awaiting confirmation'
    }
  ];

  notifications: Notification[] = [
    {
      id: 1,
      title: 'New Event: AI Workshop',
      message: 'Registration opens tomorrow for the AI & ML Workshop',
      time: '2 hours ago',
      type: 'info',
      read: false
    },
    {
      id: 2,
      title: 'Event Reminder',
      message: 'Tech Talk starts in 2 days. Don\'t forget to attend!',
      time: '5 hours ago',
      type: 'warning',
      read: false
    },
    {
      id: 3,
      title: 'Registration Confirmed',
      message: 'Your registration for Cultural Fest 2026 is confirmed',
      time: '1 day ago',
      type: 'success',
      read: false
    }
  ];

  upcomingEvents: Event[] = [
    {
      id: 1,
      title: 'Tech Talk: AI & Machine Learning',
      date: '2026-02-18',
      time: '2:00 PM',
      location: 'Auditorium Hall A',
      category: 'Technology',
      attendees: 245,
      maxAttendees: 300,
      status: 'Registered',
      description: 'Learn about the latest trends in AI and ML from industry experts',
      registered: true
    },
    {
      id: 2,
      title: 'Cultural Fest 2026',
      date: '2026-02-22',
      time: '10:00 AM',
      location: 'Main Campus Ground',
      category: 'Cultural',
      attendees: 890,
      maxAttendees: 1000,
      status: 'Open',
      description: 'Annual cultural festival with performances, competitions, and food stalls',
      registered: false
    },
    {
      id: 3,
      title: 'Web Development Workshop',
      date: '2026-02-25',
      time: '3:00 PM',
      location: 'Computer Lab 2',
      category: 'Workshop',
      attendees: 50,
      maxAttendees: 50,
      status: 'Full',
      description: 'Hands-on workshop on modern web development with React and Node.js',
      registered: true
    },
    {
      id: 4,
      title: 'Career Guidance Seminar',
      date: '2026-03-01',
      time: '11:00 AM',
      location: 'Conference Hall',
      category: 'Career',
      attendees: 180,
      maxAttendees: 200,
      status: 'Open',
      description: 'Get career advice from alumni and industry professionals',
      registered: false
    },
    {
      id: 5,
      title: 'Annual Sports Meet',
      date: '2026-03-05',
      time: '8:00 AM',
      location: 'Sports Complex',
      category: 'Sports',
      attendees: 450,
      maxAttendees: 500,
      status: 'Open',
      description: 'Inter-department sports competition with various events',
      registered: false
    },
    {
      id: 6,
      title: 'Hackathon 2026',
      date: '2026-03-10',
      time: '9:00 AM',
      location: 'Innovation Center',
      category: 'Technology',
      attendees: 95,
      maxAttendees: 100,
      status: 'Open',
      description: '24-hour coding competition with exciting prizes',
      registered: false
    },
    {
      id: 7,
      title: 'Leadership Development Seminar',
      date: '2026-03-12',
      time: '2:00 PM',
      location: 'Main Auditorium',
      category: 'Seminar',
      attendees: 150,
      maxAttendees: 250,
      status: 'Open',
      description: 'Develop leadership skills and learn from successful leaders in various industries',
      registered: false
    },
    {
      id: 8,
      title: 'Entrepreneurship Seminar',
      date: '2026-03-15',
      time: '10:00 AM',
      location: 'Business School Hall',
      category: 'Seminar',
      attendees: 120,
      maxAttendees: 200,
      status: 'Open',
      description: 'Learn how to start your own business from successful entrepreneurs',
      registered: false
    },
    {
      id: 9,
      title: 'Digital Marketing Seminar',
      date: '2026-03-18',
      time: '3:00 PM',
      location: 'Seminar Room 3',
      category: 'Seminar',
      attendees: 90,
      maxAttendees: 150,
      status: 'Open',
      description: 'Master digital marketing strategies and social media marketing techniques',
      registered: false
    },
    {
      id: 10,
      title: 'Data Science & Analytics Seminar',
      date: '2026-03-20',
      time: '1:00 PM',
      location: 'Tech Building Room 101',
      category: 'Seminar',
      attendees: 140,
      maxAttendees: 180,
      status: 'Open',
      description: 'Explore data science tools, techniques, and real-world applications',
      registered: false
    },
    {
      id: 11,
      title: 'Mental Health Awareness Seminar',
      date: '2026-03-22',
      time: '11:00 AM',
      location: 'Student Wellness Center',
      category: 'Seminar',
      attendees: 85,
      maxAttendees: 150,
      status: 'Open',
      description: 'Understanding mental health, stress management, and wellness strategies',
      registered: false
    },
    {
      id: 12,
      title: 'Cybersecurity Best Practices Seminar',
      date: '2026-03-25',
      time: '4:00 PM',
      location: 'IT Center Auditorium',
      category: 'Seminar',
      attendees: 110,
      maxAttendees: 160,
      status: 'Open',
      description: 'Learn about cybersecurity threats and how to protect yourself online',
      registered: false
    }
  ];

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
  eventHistory: any[] = [
    {
      event: {
        id: 101,
        title: 'Python Programming Workshop',
        date: '2026-01-15',
        time: '2:00 PM',
        location: 'Computer Lab 1',
        category: 'Workshop',
        description: 'Comprehensive Python programming workshop for beginners'
      },
      attended: true,
      rating: 5
    },
    {
      event: {
        id: 102,
        title: 'Annual Tech Symposium',
        date: '2026-01-20',
        time: '10:00 AM',
        location: 'Main Auditorium',
        category: 'Technology',
        description: 'Annual technology symposium featuring industry leaders'
      },
      attended: true,
      rating: 4
    },
    {
      event: {
        id: 103,
        title: 'Career Fair 2026',
        date: '2026-01-25',
        time: '9:00 AM',
        location: 'Exhibition Hall',
        category: 'Career',
        description: 'Meet top employers and explore career opportunities'
      },
      attended: false,
      rating: null
    }
  ];

  constructor() {}

  ngOnInit(): void {
    this.myRegistrations = this.upcomingEvents.filter(event => event.registered);
    this.generateCalendar();
    this.updateMonthYear();
    this.loadCalendarEvents();
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
    const pageKeywords = {
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
        // Navigate to that page
        this.setActiveTab(page);
        this.globalSearchQuery = ''; // Clear search after navigation
        this.searchQuery = ''; // Clear event search too
        return;
      }
    }
    
    // If no page match, search within events
    // Navigate to events tab and apply search filter
    this.activeTab = 'events';
    this.activeSubPage = '';
    this.searchQuery = this.globalSearchQuery;
    this.selectedCategory = 'All';
    
    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
      this.sidebarOpen = false;
    }
    
    // Focus on search input after navigation
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
    // Pre-fill form with current data
    this.editProfileForm = {
      name: this.studentName,
      email: this.email,
      phone: this.phone,
      address: this.address,
      bio: 'Passionate computer science student interested in AI and web development.'
    };
  }

  saveProfile(): void {
    // Update student information
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

  // Settings Methods
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

  // Change Password Methods
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
    
    // Here you would call your API to change password
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
    event.status = event.registered ? 'Registered' : 'Open';
    
    if (event.registered) {
      this.myRegistrations.push(event);
      this.stats[1].value++;
      alert(`Successfully registered for: ${event.title}`);
    } else {
      this.myRegistrations = this.myRegistrations.filter(e => e.id !== event.id);
      this.stats[1].value--;
      alert(`Registration cancelled for: ${event.title}`);
    }
  }

  cancelRegistration(event: Event): void {
    if (confirm(`Are you sure you want to cancel your registration for "${event.title}"?`)) {
      event.registered = false;
      event.status = 'Open';
      this.myRegistrations = this.myRegistrations.filter(e => e.id !== event.id);
      this.stats[1].value--;
      
      // Also remove from calendar if added
      this.calendarEvents = this.calendarEvents.filter(ce => ce.eventId !== event.id);
      
      alert('Registration cancelled successfully!');
    }
  }

  viewEventDetails(event: Event): void {
    alert(`Event Details:\n\nTitle: ${event.title}\nDate: ${event.date}\nTime: ${event.time}\nLocation: ${event.location}\nDescription: ${event.description}\nAttendees: ${event.attendees}/${event.maxAttendees}`);
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
    
    // Check if already added
    const exists = this.calendarEvents.find(ce => ce.eventId === event.id);
    if (!exists) {
      this.calendarEvents.push(calendarEvent);
    }
    
    // Create .ics file for download
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
    const startDate = new Date(event.date + ' ' + event.time);
    const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CampusEventHub//Event//EN
BEGIN:VEVENT
UID:${event.id}@campuseventhub.com
DTSTAMP:${this.formatICSDate(new Date())}
DTSTART:${this.formatICSDate(startDate)}
DTEND:${this.formatICSDate(endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description}
LOCATION:${event.location}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
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
    // Load events that were added to calendar
    this.myRegistrations.forEach(event => {
      this.calendarEvents.push({
        eventId: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        location: event.location,
        addedToCalendar: true
      });
    });
  }

  // Search and Filter Methods
  filterByCategory(category: string): void {
    this.selectedCategory = category;
    // Clear search query when selecting a category
    // This ensures category filters work independently
    this.searchQuery = '';
    this.globalSearchQuery = '';
  }

  getFilteredEvents(): Event[] {
    let filtered = this.upcomingEvents;
    
    // First apply category filter
    if (this.selectedCategory !== 'All') {
      filtered = filtered.filter(event => event.category === this.selectedCategory);
    }
    
    // Then apply search filter if search query exists
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
      
      const dateStr = date.toISOString().split('T')[0];
      const dayEvents = this.upcomingEvents.filter(event => event.date === dateStr);
      
      const isToday = date.getTime() === today.getTime();
      
      this.calendarDays.push({
        date: date.getDate(),
        fullDate: dateStr,
        isCurrentMonth: date.getMonth() === month,
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
    // Clear local storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Redirect to login page
    window.location.href = '/login';
  }

  cancelLogout(): void {
    this.activeTab = 'dashboard';
  }
}



