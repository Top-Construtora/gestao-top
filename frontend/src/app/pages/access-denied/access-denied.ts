import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './access-denied.html',
  styleUrls: ['./access-denied.css']
})
export class AccessDeniedComponent {
  constructor(private router: Router) {}

  goToDashboard() {
    this.router.navigate(['/home/dashboard']);
  }
}
