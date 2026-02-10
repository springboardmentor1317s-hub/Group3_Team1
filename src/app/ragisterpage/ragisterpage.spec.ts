import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ragisterpage } from './ragisterpage';

describe('Ragisterpage', () => {
  let component: Ragisterpage;
  let fixture: ComponentFixture<Ragisterpage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ragisterpage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Ragisterpage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
