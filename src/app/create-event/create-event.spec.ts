import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEvent } from './create-event';

describe('CreateEvent', () => {
  let component: CreateEvent;
  let fixture: ComponentFixture<CreateEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateEvent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateEvent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
