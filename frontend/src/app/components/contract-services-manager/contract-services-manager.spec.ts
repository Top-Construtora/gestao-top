import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContractServicesManagerComponent } from './contract-services-manager';

describe('ContractServicesManagerComponent', () => {
  let component: ContractServicesManagerComponent;
  let fixture: ComponentFixture<ContractServicesManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractServicesManagerComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ContractServicesManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});