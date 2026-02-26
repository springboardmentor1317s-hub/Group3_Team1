import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

type ChatRole = 'guest' | 'student' | 'admin' | 'super_admin';

interface ChatMessage {
  text: string;
  sender: 'bot' | 'user';
}

interface QuickQuestion {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule],
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
    if (url.includes('super-admin-dashboard')) {
      this.activeRole.set('super_admin');
      return;
    }
    if (url.includes('admin-dashboard')) {
      this.activeRole.set('admin');
      return;
    }
    if (url.includes('student-dashboard')) {
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
        text: `Hello ${roleLabel}! Ask me about events, registrations, or dashboard help.`
      }
    ]);
    this.suggestedQuestions.set(this.getPredefinedQuestions().slice(0, 3));
  }

  private getBotResponse(question: string): string {
    const q = question.toLowerCase();
    const role = this.getTargetRole(q);

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
      return 'I can help with admin tasks: create/update events, manage registrations, announcements, and role-based access.';
    }
    return 'I can help with student tasks: create account, login, browse events, register, calendar, notifications, and profile settings.';
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
        'Open Register page.\nFill your details.\nSelect role as Student.\nSubmit or click Create Account.\nGo to Login and sign in with your credentials.'
    },
    {
      question: 'How to create an admin account?',
      answer:
        '1. Open the Create Account/Register page.\n2. Enter all required details correctly.\n3. Select role as Admin.\n4. Submit the form and create the account successfully.\n5. Login using your credentials.'
    },
    {
      question: 'Where can I see available events?',
      answer:
        '1. Login with your student account.\n2. Open Student Dashboard.\n3. Go to Browse Events.\n4. Use search and category filters to find events.'
    }
  ];

  private readonly studentQuestions: QuickQuestion[] = [
    {
      question: 'How to create a new account?',
      answer:
        '1. Open Register page.\n2. Fill all required details.\n3. Select role as Student.\n4. Submit or click Create New Account.\n5. Go to Login and sign in with your credentials.'
    },
    {
      question: 'How to register for an event?',
      answer:
        '1. Go to Student Dashboard.\n2. Open Browse Events.\n3. Select an event.\n4. Click Register.\n5. Check My Registrations for confirmation.'
    },
    {
      question: 'How to update profile and password?',
      answer:
        '1. Open Profile section.\n2. Edit details and save.\n3. Open Change Password.\n4. Enter current/new password.\n5. Submit changes.'
    },
    {
      question: 'How to add an event to my calendar?',
      answer:
        '1. Open a registered event.\n2. Click Add to Calendar.\n3. Download/import the ICS file.\n4. Verify it in Google/Outlook/Apple calendar.'
    },
    {
      question: 'How to cancel event registration?',
      answer:
        '1. Open My Registrations.\n2. Select the event.\n3. Click Cancel Registration.\n4. Confirm cancellation.\n5. Check registration count updates.'
    },
    {
      question: 'How to check unread notifications?',
      answer:
        '1. Open Notifications tab.\n2. Read new alerts.\n3. Mark each as read.\n4. Confirm unread badge count becomes zero.'
    }
  ];

  private readonly adminQuestions: QuickQuestion[] = [
    {
      question: 'How to create a new event?',
      answer:
        '1. Open Admin Dashboard.\n2. Go to event management.\n3. Add title, date, time, location, and capacity.\n4. Save and publish.\n5. Monitor registrations.'
    },
    {
      question: 'How to edit or cancel an event?',
      answer:
        '1. Open event list in Admin Dashboard.\n2. Select the event.\n3. Update details or set status to cancelled.\n4. Save changes.\n5. Notify registered students.'
    },
    {
      question: 'How to manage event registrations?',
      answer:
        '1. Open registrations panel.\n2. View participant list.\n3. Approve/review attendance if applicable.\n4. Export or track counts for reporting.'
    },
    {
      question: 'How to send event announcements?',
      answer:
        '1. Open admin communications/notifications module.\n2. Select target event or audience.\n3. Write announcement.\n4. Send and verify delivery status.'
    },
    {
      question: 'How to review event analytics?',
      answer:
        '1. Open event insights/report section.\n2. Select event/date range.\n3. Review registrations, attendance, and trends.\n4. Export summary if required.'
    },
    {
      question: 'How to close registrations for an event?',
      answer:
        '1. Open event management.\n2. Select event.\n3. Change status to Closed/Full.\n4. Save.\n5. Post update for students.'
    }
  ];

  private readonly superAdminQuestions: QuickQuestion[] = [
    {
      question: 'How to assign admin roles?',
      answer:
        '1. Open Super Admin Dashboard.\n2. Locate user management.\n3. Select the target account.\n4. Assign or update role to college admin.\n5. Save changes.'
    },
    {
      question: 'How to monitor system-wide reports?',
      answer:
        '1. Open reports/analytics tab.\n2. Review event, user, and registration metrics.\n3. Filter by date/college.\n4. Export reports if needed.'
    },
    {
      question: 'How to revoke admin access?',
      answer:
        '1. Open user or role management.\n2. Search the admin account.\n3. Change role back to standard user.\n4. Save and confirm policy compliance.'
    },
    {
      question: 'How to audit role changes?',
      answer:
        '1. Open system audit logs.\n2. Filter by role-management actions.\n3. Review who changed what and when.\n4. Export logs for compliance.'
    },
    {
      question: 'How to manage college-level admins?',
      answer:
        '1. Open organization or college management.\n2. Select college.\n3. Add/update assigned admin.\n4. Save changes and notify users.'
    },
    {
      question: 'How to handle system-level incidents?',
      answer:
        '1. Check system health dashboard.\n2. Identify affected modules.\n3. Inform stakeholders.\n4. Coordinate fix and monitor recovery.'
    }
  ];
}
