import { Component, Output, EventEmitter, Input, ViewChild, ElementRef, HostListener, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SearchService } from '../../services/search.service';
import { ProfilePictureService } from '../../services/profile-picture.service';

interface Notification {
  id: number;
  time: string;
  content: string;
  isUnread: boolean;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() userName = '';
  @Input() userRole = '';
  @Input() userInitials = '';
  @Input() userId = 0;
  @Input() hasProfilePicture = false;
  @Input() notifications: Notification[] = [];
  @Input() unreadNotificationsCount = 0;
  @Input() isNotificationOpen = false;
  
  @Output() toggleMobileSidebar = new EventEmitter<void>();
  @Output() toggleNotifications = new EventEmitter<void>();
  @Output() clearNotifications = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
  
  @ViewChild('mobileSearchInput') mobileSearchInput!: ElementRef;
  
  globalSearchTerm = '';
  isSearchActive = false;
  isUserMenuOpen = false;
  
  currentDayName = '';
  currentDate = '';
  currentYear = '';
  currentTime = '';
  private timeInterval: any;

  private router = inject(Router);
  private searchService = inject(SearchService);
  private profilePictureService = inject(ProfilePictureService);
  
  profilePictureUrl = '';

  ngOnInit(): void {
    this.updateDateTime();
    this.timeInterval = setInterval(() => {
      this.updateDateTime();
    }, 60000);
    
    // Load profile picture only if user has one
    if (this.userId && this.hasProfilePicture) {
      this.profilePictureService.getProfilePictureUrl(this.userId).subscribe({
        next: (url) => {
          this.profilePictureUrl = url;
        },
        error: () => {
          this.profilePictureUrl = '';
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  private updateDateTime(): void {
    const now = new Date();
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    this.currentDayName = dayNames[now.getDay()];
    const day = now.getDate();
    const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const month = monthNames[now.getMonth()];
    this.currentDate = `${day} de ${month}`;
    this.currentYear = now.getFullYear().toString();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    this.currentTime = `${hours}:${minutes}`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const userInfo = document.querySelector('.user-info');
    const userDropdown = document.querySelector('.user-dropdown');
    
    if (userInfo && !userInfo.contains(event.target as Node) && 
        userDropdown && !userDropdown.contains(event.target as Node)) {
      this.isUserMenuOpen = false;
    }
  }
  
  toggleSearch(): void {
    this.isSearchActive = !this.isSearchActive;
    if (this.isSearchActive) {
      this.isUserMenuOpen = false;
      setTimeout(() => {
        this.mobileSearchInput?.nativeElement?.focus();
      }, 100);
    }
  }
  
  closeSearch(): void {
    this.isSearchActive = false;
    this.globalSearchTerm = '';
    this.onSearch();
  }
  
  onSearch(): void {
    this.searchService.setSearchTerm(this.globalSearchTerm);
  }
  
  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    this.isSearchActive = false;
  }
  
  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }
  
  navigateToSettings(event: Event): void {
    event.preventDefault();
    this.router.navigate(['/home/configuracoes']);
    this.closeUserMenu();
  }
  
  handleLogout(event: Event): void {
    event.preventDefault();
    this.logout.emit();
    this.closeUserMenu();
  }
  
  viewAllNotifications(event: Event): void {
    event.preventDefault();
    console.log('Ver todas as notificações');
  }
  
  markAsRead(notification: Notification): void {
    if (notification.isUnread) {
      notification.isUnread = false;
      this.toggleNotifications.emit();
    }
  }
}