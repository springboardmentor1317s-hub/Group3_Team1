import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { SiteFooterComponent } from './shared/site-footer/site-footer.component';

type ChatRole = 'guest' | 'student' | 'admin' | 'super_admin';

interface ChatMessage {
  text: string;
  sender: 'bot' | 'user';
}

interface QuickQuestion {
  question: string;
  answer: string;
  keywords?: string[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule, SiteFooterComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, OnDestroy {
  @ViewChild('chatBody') private chatBodyRef?: ElementRef<HTMLDivElement>;

  public readonly title = signal('Campus Event Hub');
  public readonly isChatOpen = signal(false);
  public readonly activeRole = signal<ChatRole>('guest');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly suggestedQuestions = signal<QuickQuestion[]>([]);
  public userInput = '';

  private readonly routerSub = new Subscription();

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.updateRoleFromUrl(this.router.url);
    this.resetChatForRole();

    this.routerSub.add(
      this.router.events.subscribe(event => {
        if (event instanceof NavigationEnd) {
          this.updateRoleFromUrl(event.urlAfterRedirects);
          this.resetChatForRole();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }

  public toggleChat(): void {
    this.isChatOpen.set(!this.isChatOpen());
  }

  public sendMessage(): void {
    const question = this.userInput.trim();
    if (!question) return;

    this.pushUserAndBotMessage(question);
    this.userInput = '';
  }

  public getPredefinedQuestions(): QuickQuestion[] {
    const role = this.activeRole();
    if (role === 'student') return this.studentQuestions;
    if (role === 'admin') return this.adminQuestions;
    if (role === 'super_admin') return this.superAdminQuestions;
    return this.guestQuestions;
  }

  public askPredefinedQuestion(item: QuickQuestion): void {
    this.pushUserAndBotMessage(item.question, item.answer);
  }

  public getVisibleSuggestions(): QuickQuestion[] {
    const current = this.suggestedQuestions();
    if (current.length) return current;
    return this.getPredefinedQuestions().slice(0, 3);
  }

  private updateRoleFromUrl(url: string): void {
    const normalizedUrl = url.toLowerCase();

    if (normalizedUrl.includes('super-admin')) {
      this.activeRole.set('super_admin');
      return;
    }
    if (
      normalizedUrl.includes('admin-dashboard')
      || normalizedUrl.includes('admin-profile')
      || normalizedUrl.includes('admin-my-events')
      || normalizedUrl.includes('admin-registration-details')
      || normalizedUrl.includes('admin-old-events')
      || normalizedUrl.includes('admin-create-event')
      || normalizedUrl.includes('admin-attendance-screen')
      || normalizedUrl.includes('admin-notifications')
    ) {
      this.activeRole.set('admin');
      return;
    }
    if (
      normalizedUrl.includes('student-dashboard')
      || normalizedUrl.includes('new-student-dashboard')
      || normalizedUrl.includes('student-events')
      || normalizedUrl.includes('student-event')
      || normalizedUrl.includes('student-profile')
      || normalizedUrl.includes('student-registrations')
      || normalizedUrl.includes('student-feedback')
      || normalizedUrl.includes('student-notifications')
      || normalizedUrl.includes('student-payment')
    ) {
      this.activeRole.set('student');
      return;
    }
    this.activeRole.set('guest');
  }

  private resetChatForRole(): void {
    const role = this.activeRole();
    const roleLabel =
      role === 'super_admin'
        ? 'Super Admin'
        : role === 'admin'
          ? 'Admin'
          : role === 'student'
            ? 'Student'
            : 'Guest';

    this.messages.set([
      {
        sender: 'bot',
        text: `Hello ${roleLabel}! Ask me about any feature, workflow, or FAQ for this dashboard.`
      }
    ]);
    this.suggestedQuestions.set(this.getPredefinedQuestions().slice(0, 3));
  }

  private getBotResponse(question: string): string {
    const q = question.toLowerCase();
    const role = this.getTargetRole(q);
    const matchedFaq = this.findBestQuestionMatch(question, role);

    if (matchedFaq) {
      return matchedFaq.answer;
    }

    const asksAccountCreation =
      (q.includes('create') || q.includes('new') || q.includes('signup') || q.includes('sign up')) &&
      (q.includes('account') || q.includes('register'));
    if (asksAccountCreation) {
      if (role === 'admin' || role === 'super_admin') {
        return 'For admin access, create an account from Register, then sign in and request/verify admin role assignment from Super Admin.';
      }
      return 'To create a student account: open Register, fill details, submit, then sign in from Login with your new credentials.';
    }

    if (q.includes('register') || q.includes('registration')) {
      if (q.includes('event')) {
        return role === 'student'
          ? 'To register for an event: go to Student Dashboard > Browse Events, choose an event, and click Register. Track it in My Registrations.'
          : 'To handle event registrations: open admin dashboard sections for participant lists, approvals, or attendance tracking.';
      }
      return role === 'student'
        ? 'If you mean account registration, use Register page. If you mean event registration, use Browse Events in Student Dashboard.'
        : 'For admin-related registration tasks, verify whether you mean admin account onboarding or participant event registrations.';
    }

    const asksCreateEvent =
      (q.includes('create') || q.includes('add') || q.includes('new')) &&
      (q.includes('event') || q.includes('ivent'));
    if (asksCreateEvent) {
      return role === 'student'
        ? 'Event creation is an admin action. Students can browse and register for published events.'
        : 'To create a new event: open Admin Dashboard, go to event management, add title/date/time/location/capacity, publish, then monitor registrations.';
    }

    if (q.includes('edit event') || q.includes('update event') || q.includes('delete event') || q.includes('cancel event')) {
      return role === 'student'
        ? 'Students cannot modify event records. Contact an admin if an event needs changes.'
        : 'Use Admin Dashboard event management to edit details, change status, or cancel events. Inform registered users after updates.';
    }

    if (q.includes('notification') || q.includes('alert') || q.includes('announcement')) {
      return role === 'student'
        ? 'Students should check Notifications for reminders and updates, and mark messages as read.'
        : 'Admins can send announcements/reminders from dashboard communication tools and monitor delivery.';
    }

    if (q.includes('profile') || q.includes('account') || q.includes('password')) {
      return role === 'student'
        ? 'Use Profile to edit account details, preferences, and password.'
        : 'Use account settings to update admin profile details and credentials.';
    }

    if (q.includes('event') || q.includes('schedule') || q.includes('calendar')) {
      return role === 'student'
        ? 'Open Browse Events for upcoming activities, then use category/search filters. Use Calendar for date-wise planning.'
        : 'Use admin event modules to create, review, and monitor upcoming schedules.';
    }

    if (q.includes('admin') || q.includes('student') || q.includes('role')) {
      return `Current chat mode: ${role}. I provide student and admin specific guidance automatically.`;
    }

    if (role === 'admin' || role === 'super_admin') {
      return 'I can help with admin tasks such as event creation, registration review, payments, student queries, attendance, admit cards, certificates, notifications, and role-based access.';
    }
    return 'I can help with student tasks such as account setup, profile completion, event browsing, registration, payment, notifications, admit cards, feedback, and support queries.';
  }

  private getTargetRole(question: string): ChatRole {
    if (question.includes('super admin') || question.includes('super-admin')) {
      return 'super_admin';
    }
    if (question.includes('admin') || question.includes('college admin')) {
      return 'admin';
    }
    if (question.includes('student') || question.includes('user')) {
      return 'student';
    }
    return this.activeRole();
  }

  private pushUserAndBotMessage(question: string, fixedAnswer?: string): void {
    this.messages.update(items => [...items, { text: question, sender: 'user' }]);
    const reply = fixedAnswer ?? this.getBotResponse(question);
    this.messages.update(items => [...items, { text: reply, sender: 'bot' }]);
    const related = this.getRelatedQuestions(question);
    const fallback = this.getPredefinedQuestions()
      .filter(item => this.normalizeQuestion(item.question) !== this.normalizeQuestion(question))
      .slice(0, 3);
    this.suggestedQuestions.set(related.length ? related : fallback);
    this.scrollChatToBottom();
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const chatBody = this.chatBodyRef?.nativeElement;
      if (!chatBody) return;
      chatBody.scrollTop = chatBody.scrollHeight;
    });
  }

  private getRelatedQuestions(question: string): QuickQuestion[] {
    const q = question.toLowerCase();
    const role = this.getTargetRole(q);
    const pool = this.getQuestionPoolByRole(role);
    const matchedFaq = this.findBestQuestionMatch(question, role);

    if (matchedFaq) {
      const matchedKeywords = matchedFaq.keywords || [];
      const relatedByKeyword = pool.filter(item =>
        this.normalizeQuestion(item.question) !== this.normalizeQuestion(matchedFaq.question)
        && (item.keywords || []).some(keyword => matchedKeywords.includes(keyword))
      );

      if (relatedByKeyword.length) {
        return relatedByKeyword.slice(0, 3);
      }
    }

    let related = pool.filter(item => {
      const itemQ = item.question.toLowerCase();
      if (q.includes('account') || q.includes('signup') || q.includes('sign up') || q.includes('login')) {
        return itemQ.includes('account');
      }
      if (q.includes('register') || q.includes('registration')) {
        return itemQ.includes('register');
      }
      if (q.includes('event') || q.includes('ivent') || q.includes('schedule') || q.includes('calendar')) {
        return itemQ.includes('event');
      }
      if (q.includes('profile') || q.includes('password')) {
        return itemQ.includes('profile') || itemQ.includes('password');
      }
      if (q.includes('role') || q.includes('admin access') || q.includes('assign admin')) {
        return itemQ.includes('admin') || itemQ.includes('role');
      }
      if (q.includes('report')) {
        return itemQ.includes('report');
      }
      return false;
    });

    if (!related.length) {
      related = pool;
    }

    return related
      .filter(item => this.normalizeQuestion(item.question) !== this.normalizeQuestion(question))
      .slice(0, 3);
  }

  private findBestQuestionMatch(question: string, role: ChatRole): QuickQuestion | null {
    const normalizedQuestion = this.normalizeQuestion(question);
    const directPool = this.getQuestionPoolByRole(role);
    const pools = role === 'guest' ? [directPool] : [directPool, this.guestQuestions];
    const allItems = pools.flat();

    const exactMatch = allItems.find(
      item => this.normalizeQuestion(item.question) === normalizedQuestion
    );

    if (exactMatch) {
      return exactMatch;
    }

    let bestMatch: QuickQuestion | null = null;
    let bestScore = 0;

    for (const item of allItems) {
      let score = 0;
      const keywords = item.keywords || [];

      for (const keyword of keywords) {
        const normalizedKeyword = this.normalizeQuestion(keyword);
        if (!normalizedKeyword) continue;
        if (normalizedQuestion.includes(normalizedKeyword)) {
          score += normalizedKeyword.split(' ').length >= 2 ? 4 : 2;
        }
      }

      const normalizedItemQuestion = this.normalizeQuestion(item.question);
      const itemTokens = normalizedItemQuestion.split(' ').filter(token => token.length > 3);
      for (const token of itemTokens) {
        if (normalizedQuestion.includes(token)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  private normalizeQuestion(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private getQuestionPoolByRole(role: ChatRole): QuickQuestion[] {
    if (role === 'student') return this.studentQuestions;
    if (role === 'admin') return this.adminQuestions;
    if (role === 'super_admin') return this.superAdminQuestions;
    return this.guestQuestions;
  }

  private readonly guestQuestions: QuickQuestion[] = [
    {
      question: 'How to create a new student account?',
      answer:
        '1. Open the Register page.\n2. Fill in your details.\n3. Select the Student role.\n4. Submit the form.\n5. Login with your new credentials.',
      keywords: ['student account', 'create account', 'register', 'signup', 'sign up']
    },
    {
      question: 'How to create an admin account?',
      answer:
        '1. Open the Register page.\n2. Fill the required details.\n3. Select the Admin role.\n4. Submit the form.\n5. After signup, wait for Super Admin approval before full admin access.',
      keywords: ['admin account', 'admin signup', 'admin register', 'college admin']
    },
    {
      question: 'Why is my admin account under verification?',
      answer:
        'New admin accounts go through Super Admin review. Until approval is completed, the account stays on the admin approval pending screen. If rejected, the rejection reason is shown there.',
      keywords: ['admin approval', 'under verification', 'pending', 'rejected', 'blocked']
    },
    {
      question: 'How do I login after registration?',
      answer:
        '1. Open the Login page.\n2. Enter your registered email and password.\n3. Sign in.\n4. You will be routed to the dashboard based on your role and approval status.',
      keywords: ['login', 'sign in', 'after registration', 'credentials']
    },
    {
      question: 'Where can I see available events?',
      answer:
        '1. Login as a student.\n2. Open the Student Dashboard or Student Events page.\n3. Browse upcoming events.\n4. Use search, category, college, and date filters to narrow results.',
      keywords: ['available events', 'browse events', 'find events', 'search events']
    },
    {
      question: 'Which roles are available in this project?',
      answer:
        'This project supports three main roles: Student, College Admin, and Super Admin. Each role sees its own dashboard, actions, and permissions.',
      keywords: ['roles', 'student', 'admin', 'super admin', 'permissions']
    }
  ];

  private readonly studentQuestions: QuickQuestion[] = [
    {
      question: 'What can I do on the student dashboard?',
      answer:
        'Students can browse events, filter events, open event details, register for free or paid events, track registration status, view notifications, manage profile details, download admit cards, rate completed events, submit feedback, and raise support queries.',
      keywords: ['student dashboard', 'student features', 'what can i do', 'dashboard help']
    },
    {
      question: 'How to browse and filter events?',
      answer:
        '1. Open Student Dashboard or Student Events.\n2. Use search to find events by title, description, location, or college.\n3. Apply category, college, and date filters.\n4. Open an event card to view full details before registering.',
      keywords: ['browse events', 'filter events', 'search events', 'student events']
    },
    {
      question: 'How to register for a free event?',
      answer:
        '1. Open the event from Student Events or the dashboard.\n2. Click Register.\n3. Complete or verify your profile details.\n4. Confirm the declaration checkbox.\n5. Submit the registration. Your request moves to pending admin review.',
      keywords: ['register event', 'free event', 'event registration', 'submit registration']
    },
    {
      question: 'How does paid event registration work?',
      answer:
        'For paid events, the same registration form opens first. After confirming your details, click Proceed To Pay. Razorpay checkout opens, payment is verified, and then your registration is submitted for admin review.',
      keywords: ['paid event', 'payment', 'razorpay', 'proceed to pay']
    },
    {
      question: 'What if my registration gets rejected?',
      answer:
        'Rejected registrations can be opened again from the registration flow. Update the form details if needed and resubmit. The status will move back to pending review.',
      keywords: ['rejected', 'resubmit', 'registration rejected', 'update and resubmit']
    },
    {
      question: 'Where can I check my registration status?',
      answer:
        'Open My Registrations to see all your event applications. Status values like Pending, Approved, and Rejected are shown there along with filters and search.',
      keywords: ['my registrations', 'registration status', 'pending approved rejected']
    },
    {
      question: 'How to cancel a pending registration?',
      answer:
        'Open My Registrations, choose a pending or rejected entry, and use the cancel/delete option. Approved registrations are not removable from that panel.',
      keywords: ['cancel registration', 'delete registration', 'pending registration']
    },
    {
      question: 'How to update my profile before registration?',
      answer:
        'Open Student Profile to update personal, academic, and address details. The registration form also pre-fills and updates profile details, so incomplete information can be completed there before submission.',
      keywords: ['profile', 'update profile', 'student profile', 'details']
    },
    {
      question: 'How do notifications work for students?',
      answer:
        'Students receive dashboard dropdown notifications and a full inbox page. You can open notifications, mark items as seen, delete single items, or clear the inbox.',
      keywords: ['notifications', 'alerts', 'student notifications', 'mark seen']
    },
    {
      question: 'How can I download my admit card?',
      answer:
        'Approved events appear in the Admit Cards panel on the student dashboard. If the admin has generated and distributed your admit card, you can download the PDF directly from there.',
      keywords: ['admit card', 'download admit card', 'approved events', 'pdf']
    },
    {
      question: 'How do ratings and feedback work?',
      answer:
        'After an approved event is completed, you can rate it from 1 to 5 stars and submit written feedback. Your feedback also appears in the feedback summary page for your account.',
      keywords: ['feedback', 'rating', 'review', 'completed event']
    },
    {
      question: 'How do I raise a support query?',
      answer:
        'On the student dashboard, use the support query section to enter a subject and message. You can track the status, delete an open query if allowed, or request escalation when available.',
      keywords: ['support query', 'query', 'help request', 'escalate']
    }
  ];

  private readonly adminQuestions: QuickQuestion[] = [
    {
      question: 'What can I do on the admin dashboard?',
      answer:
        'Admins can create and edit events, review registrations, approve or reject students, monitor payments, answer student queries, review feedback, manage notifications, open attendance tools, generate admit cards, distribute admit cards, and generate certificates.',
      keywords: ['admin dashboard', 'admin features', 'what can i do', 'dashboard help']
    },
    {
      question: 'How to create a new event?',
      answer:
        '1. Open Admin Dashboard.\n2. Go to Create Event.\n3. Add title, description, category, venue, date, time, organizer, capacity, and any paid-event details.\n4. Save or publish the event.\n5. Then monitor registrations from the dashboard.',
      keywords: ['create event', 'new event', 'add event', 'publish event']
    },
    {
      question: 'How to edit, close, or delete an event?',
      answer:
        'Use Admin Dashboard or My Events to open an existing event. From there you can edit event details, close registration by status/date, or delete the event if needed.',
      keywords: ['edit event', 'update event', 'close event', 'delete event', 'cancel event']
    },
    {
      question: 'How to review student registrations?',
      answer:
        'Open the registrations area to review student applications event-wise. You can inspect registration details, check the student profile snapshot, and approve or reject the request.',
      keywords: ['registrations', 'review registration', 'approve reject', 'student application']
    },
    {
      question: 'How can admins view payment details?',
      answer:
        'Use the Payments tab in the admin dashboard. For paid events, it shows payment records, success and pending counts, and related payment information for each event.',
      keywords: ['payments', 'payment details', 'paid events', 'payment records']
    },
    {
      question: 'How do student queries reach admins?',
      answer:
        'Student support queries appear in the Queries section for the admin college. Admins can send a response, add a progress note, and change the query status to Open, In Progress, or Resolved.',
      keywords: ['queries', 'student query', 'reply query', 'resolved']
    },
    {
      question: 'How does attendance management work?',
      answer:
        'Open the attendance tools to view today events, fetch approved students, and mark attendance. Admins can scan QR codes from admit cards using camera or manual scan input.',
      keywords: ['attendance', 'scan qr', 'mark attendance', 'today events']
    },
    {
      question: 'How do admit cards and certificates work for admins?',
      answer:
        'For selected events, admins can generate admit cards for approved students, preview cards, distribute them, upload a certificate signature/template, and generate certificates for attended students.',
      keywords: ['admit cards', 'generate admit cards', 'distribute admit cards', 'certificates']
    },
    {
      question: 'How do notifications work for admins?',
      answer:
        'Admins have dashboard notification dropdowns and a full notifications inbox page. New registration updates, query updates, and related alerts can be opened, marked seen, or deleted.',
      keywords: ['admin notifications', 'notifications', 'alerts', 'inbox']
    },
    {
      question: 'How can admins review event feedback?',
      answer:
        'The Feedback tab shows student ratings and comments grouped by event, along with average ratings and recent feedback activity to help admins evaluate event quality.',
      keywords: ['feedback', 'event feedback', 'ratings', 'reviews']
    }
  ];

  private readonly superAdminQuestions: QuickQuestion[] = [
    {
      question: 'What can I do on the super admin dashboard?',
      answer:
        'Super Admin can review college admin requests, approve or reject admin access, monitor total admins/events/students, open students/admins/events panels, and review admin activity reports.',
      keywords: ['super admin dashboard', 'super admin features', 'what can i do']
    },
    {
      question: 'How to approve a college admin request?',
      answer:
        'Open the Super Admin Dashboard, find the pending admin request, and click approve. Once approved, that user gets college admin access.',
      keywords: ['approve admin', 'admin request', 'college admin approval']
    },
    {
      question: 'How to reject an admin request?',
      answer:
        'Open the pending request, enter a rejection reason, and reject it. The reason is stored and can be shown back to the applicant on the pending/rejected screen.',
      keywords: ['reject admin', 'rejection reason', 'admin request rejected']
    },
    {
      question: 'What information is visible in super admin stats?',
      answer:
        'The dashboard shows top-level counts such as total admins, total events, and total students, along with approval request summaries.',
      keywords: ['stats', 'total admins', 'total events', 'total students']
    },
    {
      question: 'What is the admin activity report?',
      answer:
        'The admin activity report highlights college admin activity such as events created, college details, last active label, and activity level like High, Medium, or Low.',
      keywords: ['admin activity', 'activity report', 'high medium low']
    },
    {
      question: 'Which super admin panels are available?',
      answer:
        'Super Admin has dedicated routes for overview plus separate Students, Admins, and Events panels for broader platform monitoring.',
      keywords: ['students panel', 'admins panel', 'events panel', 'super admin pages']
    }
  ];
}
