import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserSelectionModal } from './user-selection-modal';

describe('UserSelectionModal', () => {
  let component: UserSelectionModal;
  let fixture: ComponentFixture<UserSelectionModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserSelectionModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserSelectionModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
