import { Injectable } from '@angular/core';

export type AdminApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AdminApprovalRequest {
  name: string;
  userId: string;
  email: string;
  college?: string;
  role: 'college_admin';
  status: AdminApprovalStatus;
  createdAt: string;
  reviewedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminApprovalService {
  private readonly storageKey = 'adminApprovalRequests';

  getAllRequests(): AdminApprovalRequest[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as AdminApprovalRequest[]) : [];
    } catch {
      return [];
    }
  }

  saveRequest(
    data: Pick<AdminApprovalRequest, 'name' | 'userId' | 'email' | 'college' | 'role'>
  ): void {
    const requests = this.getAllRequests();
    const now = new Date().toISOString();
    const existingIndex = requests.findIndex(
      (item) => item.email.toLowerCase() === data.email.toLowerCase() || item.userId === data.userId
    );

    const request: AdminApprovalRequest = {
      ...data,
      status: 'pending',
      createdAt: now
    };

    if (existingIndex >= 0) {
      requests[existingIndex] = request;
    } else {
      requests.unshift(request);
    }

    localStorage.setItem(this.storageKey, JSON.stringify(requests));
  }

  getStatus(identifier: string): AdminApprovalStatus | null {
    const normalized = identifier.toLowerCase();
    const request = this.getAllRequests().find(
      (item) => item.email.toLowerCase() === normalized || item.userId === identifier
    );
    return request?.status ?? null;
  }

  updateStatus(identifier: string, status: AdminApprovalStatus): void {
    const normalized = identifier.toLowerCase();
    const requests = this.getAllRequests();
    const index = requests.findIndex(
      (item) => item.email.toLowerCase() === normalized || item.userId === identifier
    );

    if (index < 0) {
      return;
    }

    requests[index] = {
      ...requests[index],
      status,
      reviewedAt: new Date().toISOString()
    };

    localStorage.setItem(this.storageKey, JSON.stringify(requests));
  }
}
