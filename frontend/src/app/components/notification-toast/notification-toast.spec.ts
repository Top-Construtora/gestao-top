import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationToast } from './notification-toast';

describe('NotificationToast', () => {
  let component: NotificationToast;
  let fixture: ComponentFixture<NotificationToast>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationToast]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotificationToast);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
