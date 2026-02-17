import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Registerpage } from './registerpage';

describe('Registerpage', () => {
  let component: Registerpage;
  let fixture: ComponentFixture<Registerpage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Registerpage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Registerpage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
