import { Component, forwardRef, Input, Output, EventEmitter } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';

type InputTypes = 'text' | 'password' | 'email';

@Component({
  selector: 'app-login-primary-input',
  imports: [ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LoginPrimaryInput),
      multi: true
    }
  ],
  templateUrl: './login-primary-input.html',
  styleUrl: './login-primary-input.css'
})
export class LoginPrimaryInput implements ControlValueAccessor {
  @Input() type: InputTypes = "text";
  @Input() placeholder: string = "";
  @Input() label: string = "";
  @Input() inputName: string = "";
  @Output() keypress = new EventEmitter<KeyboardEvent>();
  
  value: string = ''
  onChange: any = () => {}
  onTouched: any = () => {}
  
  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    this.onChange(value)
  }

  onKeyPress(event: KeyboardEvent) {
    this.keypress.emit(event);
  }
  
  writeValue(value: any): void {
    this.value = value
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
      
  }
}