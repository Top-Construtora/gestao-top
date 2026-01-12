import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContractsTableComponent } from './contracts-table';

describe('ContractsTableComponent', () => {
  let component: ContractsTableComponent;
  let fixture: ComponentFixture<ContractsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractsTableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContractsTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});