import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServicesModal } from './services-modal';

describe('ServicesModal', () => {
  let component: ServicesModal;
  let fixture: ComponentFixture<ServicesModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServicesModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServicesModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
