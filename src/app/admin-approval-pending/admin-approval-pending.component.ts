import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-approval-pending',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-approval-pending.component.html',
  styleUrls: ['./admin-approval-pending.component.css']
})
export class AdminApprovalPendingComponent {
  status: 'pending' | 'rejected' | 'blocked' = 'pending';
  reason = '';

  constructor(private router: Router, private route: ActivatedRoute) {
    const status = this.route.snapshot.queryParamMap.get('status');
    const reason = this.route.snapshot.queryParamMap.get('reason');

    if (status === 'rejected') {
      this.status = 'rejected';
    } else if (status === 'blocked') {
      this.status = 'blocked';
    } else {
      this.status = 'pending';
    }

    this.reason = reason || '';
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
