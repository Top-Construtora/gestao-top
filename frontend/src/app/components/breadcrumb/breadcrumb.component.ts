import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BreadcrumbService, BreadcrumbItem } from '../../services/breadcrumb.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="breadcrumb-container" aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li *ngFor="let item of breadcrumbs; let last = last" 
            class="breadcrumb-item"
            [class.active]="last">
          <a *ngIf="!last && item.url" 
             [routerLink]="item.url"
             class="breadcrumb-link"
             [attr.aria-current]="last ? 'page' : null">
            <i *ngIf="item.icon" [class]="item.icon" aria-hidden="true"></i>
            <span>{{ item.label }}</span>
          </a>
          <span *ngIf="last || !item.url" 
                class="breadcrumb-text"
                [attr.aria-current]="last ? 'page' : null">
            <i *ngIf="item.icon" [class]="item.icon" aria-hidden="true"></i>
            <span>{{ item.label }}</span>
          </span>
          <span *ngIf="!last" class="breadcrumb-separator" aria-hidden="true">
            <i class="fas fa-chevron-right"></i>
          </span>
        </li>
      </ol>
    </nav>
  `,
  styles: [`
    .breadcrumb-container {
      padding: 0.75rem 0;
      margin-bottom: 1rem;
      background: transparent;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      list-style: none;
      margin: 0;
      padding: 0;
      font-size: 0.875rem;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      position: relative;
      margin-right: 0.5rem;
    }

    .breadcrumb-item:last-child {
      margin-right: 0;
    }

    .breadcrumb-link {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: #64748b;
      text-decoration: none;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: all 0.2s ease;
      position: relative;
    }

    .breadcrumb-link:hover {
      color: var(--top-secondary, #12b0a0);
      background: rgba(18, 176, 160, 0.08);
    }

    .breadcrumb-link i {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .breadcrumb-text {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--top-secondary, #12b0a0);
      font-weight: 600;
      padding: 0.25rem 0.5rem;
    }

    .breadcrumb-text i {
      font-size: 0.75rem;
    }

    .breadcrumb-separator {
      margin: 0 0.25rem;
      color: #94a3b8;
      font-size: 0.625rem;
      opacity: 0.6;
    }

    .breadcrumb-item.active .breadcrumb-text {
      color: var(--top-secondary, #12b0a0);
      font-weight: 600;
      position: relative;
    }

    .breadcrumb-item.active .breadcrumb-text::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0.5rem;
      right: 0.5rem;
      height: 2px;
      background: var(--top-secondary, #12b0a0);
      border-radius: 1px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        transform: scaleX(0);
        opacity: 0;
      }
      to {
        transform: scaleX(1);
        opacity: 1;
      }
    }

    /* Específico para 1280x800 */
    @media (width: 1280px) and (height: 800px) {
      .breadcrumb-container {
        padding: 0.5rem 0;
        margin-bottom: 0.75rem;
      }

      .breadcrumb {
        font-size: 0.8rem;
      }

      .breadcrumb-link,
      .breadcrumb-text {
        padding: 0.2rem 0.4rem;
        gap: 0.3rem;
      }

      .breadcrumb-link i,
      .breadcrumb-text i {
        font-size: 0.7rem;
      }

      .breadcrumb-separator {
        margin: 0 0.2rem;
        font-size: 0.55rem;
      }
    }

    /* Responsivo */
    @media (max-width: 767px) {
      .breadcrumb-container {
        padding: 0.5rem 0;
        margin-bottom: 0.75rem;
      }

      .breadcrumb {
        font-size: 0.75rem;
      }

      .breadcrumb-link,
      .breadcrumb-text {
        padding: 0.2rem 0.375rem;
      }

      .breadcrumb-link i,
      .breadcrumb-text i {
        font-size: 0.625rem;
      }

      .breadcrumb-separator {
        margin: 0 0.125rem;
        font-size: 0.5rem;
      }
    }

    @media (max-width: 575px) {
      .breadcrumb {
        font-size: 0.7rem;
      }

      .breadcrumb-link span,
      .breadcrumb-text span {
        display: none;
      }

      .breadcrumb-item:last-child .breadcrumb-text span {
        display: inline;
      }

      .breadcrumb-link i,
      .breadcrumb-text i {
        font-size: 0.875rem;
      }
    }
  `]
})
export class BreadcrumbComponent implements OnInit, OnDestroy {
  breadcrumbs: BreadcrumbItem[] = [];
  private destroy$ = new Subject<void>();

  constructor(private breadcrumbService: BreadcrumbService) {}

  ngOnInit(): void {
    this.breadcrumbService.breadcrumbs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}