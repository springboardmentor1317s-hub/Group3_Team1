import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Role } from './role';

describe('Role', () => {
  let component: Role;
  let fixture: ComponentFixture<Role>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Role]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Role);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
