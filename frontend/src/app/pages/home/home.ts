import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { SidebarComponent } from '../../components/sidebar/sidebar';
import { ContractModalComponent } from '../../components/contract-modal/contract-modal';
import { UserModal } from '../../components/user-modal/user-modal';
import { NotificationDropdownComponent } from '../../components/notification-dropdown/notification-dropdown';
import { NotificationCenterComponent } from '../../components/notification-center/notification-center';
import { AuthService, User } from '../../services/auth';
import { ApiUser } from '../../services/user';
import { ApiCompany } from '../../services/company';
import { ModalService } from '../../services/modal.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

interface Notification {
  id: number;
  time: string;
  content: string;
  isUnread: boolean;
}

interface NavItem {
  id: string;
  icon: string;
  text: string;
  active: boolean;
  route?: string;
  adminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    RouterModule,
    HeaderComponent,
    SidebarComponent,
    ContractModalComponent,
    UserModal,
    NotificationDropdownComponent,
    NotificationCenterComponent
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  userName = '';
  userRole = '';
  userInitials = '';
  userId = 0;
  userHasProfilePicture = false;
  isSidebarCollapsed = false;
  isMobileSidebarOpen = false;
  isNotificationOpen = false;
  isNotificationCenterOpen = false;
  editingUser: ApiUser | null = null;
  editingCompany: ApiCompany | null = null;
  notifications: any[] = [];
  unreadNotificationsCount = 0;
  navSections: any[] = [];
  servicesList: any[] = [];
  selectedServices: Set<string> = new Set();
  isContractModalOpen = false;
  isCompanyModalOpen = false;
  isUserModalOpen = false;

  private subscriptions = new Subscription();

  constructor(
    private router: Router,
    private authService: AuthService,
    private modalService: ModalService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadUserData();
    
    this.subscriptions.add(
      this.notificationService.unreadCount$.subscribe(count => {
        this.unreadNotificationsCount = count;
      })
    );

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.isMobileSidebarOpen = false;
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  private loadUserData() {
    const user = this.authService.getUser();
    if (user) {
      this.userName = user.name;
      this.userRole = user.role === 'admin' ? 'Administrador' : 'Usuário';
      this.userInitials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      this.userId = user.id;
      this.userHasProfilePicture = !!(user.profile_picture_path);
    }
  }

  toggleSidebar() { this.isSidebarCollapsed = !this.isSidebarCollapsed; }
  toggleMobileSidebar() { this.isMobileSidebarOpen = !this.isMobileSidebarOpen; }
  closeMobileSidebar() { this.isMobileSidebarOpen = false; }
  toggleNotifications() { this.isNotificationOpen = !this.isNotificationOpen; }
  
  openNotificationCenter() { 
    this.isNotificationCenterOpen = true; 
    this.isNotificationOpen = false; // Fechar dropdown se estiver aberto
  }
  
  closeNotificationCenter() { 
    this.isNotificationCenterOpen = false; 
  }
  clearNotifications() { this.notificationService.clearHistory(); }
  closeContractModal() { this.isContractModalOpen = false; }
  closeUserModal() { this.isUserModalOpen = false; }
  saveContract() {}
  saveUser() {}
  navigateTo(route: string) { this.router.navigate([route]); }

  logout() {
    this.authService.logout().subscribe();
  }
}