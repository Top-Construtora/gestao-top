import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContractModal } from './contract-modal';

describe('ContractModal', () => {
  let component: ContractModal;
  let fixture: ComponentFixture<ContractModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContractModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});