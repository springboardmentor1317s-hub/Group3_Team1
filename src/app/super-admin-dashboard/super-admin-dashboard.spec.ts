import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuperAdminDashboard } from './super-admin-dashboard';

describe('SuperAdminDashboard', () => {
  let component: SuperAdminDashboard;
  let fixture: ComponentFixture<SuperAdminDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuperAdminDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SuperAdminDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
