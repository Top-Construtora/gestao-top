import { Directive, ElementRef, OnInit, OnDestroy, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[scrollAnimation]',
  standalone: true
})
export class ScrollAnimationDirective implements OnInit, OnDestroy {
  @Input() animationType: 'fade' | 'slide' | 'zoom' | 'slideLeft' | 'slideRight' = 'fade';
  @Input() animationDelay: number = 0;
  @Input() animationDuration: number = 0.8;
  @Input() threshold: number = 0.15;
  @Input() rootMargin: string = '0px';
  @Input() stagger: boolean = false;
  @Input() staggerDelay: number = 0.1;

  private observer: IntersectionObserver | null = null;
  private isVisible: boolean = false;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    this.setupInitialStyles();
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  private setupInitialStyles() {
    const element = this.el.nativeElement;

    // Set initial styles based on animation type
    this.renderer.setStyle(element, 'transition',
      `all ${this.animationDuration}s cubic-bezier(0.4, 0, 0.2, 1) ${this.animationDelay}s`);

    switch (this.animationType) {
      case 'fade':
        this.renderer.setStyle(element, 'opacity', '0');
        break;
      case 'slide':
        this.renderer.setStyle(element, 'opacity', '0');
        this.renderer.setStyle(element, 'transform', 'translateY(50px)');
        break;
      case 'slideLeft':
        this.renderer.setStyle(element, 'opacity', '0');
        this.renderer.setStyle(element, 'transform', 'translateX(-50px)');
        break;
      case 'slideRight':
        this.renderer.setStyle(element, 'opacity', '0');
        this.renderer.setStyle(element, 'transform', 'translateX(50px)');
        break;
      case 'zoom':
        this.renderer.setStyle(element, 'opacity', '0');
        this.renderer.setStyle(element, 'transform', 'scale(0.8)');
        break;
    }
  }

  private setupIntersectionObserver() {
    const options = {
      root: null,
      rootMargin: this.rootMargin,
      threshold: [0, this.threshold, 0.5, 1.0]
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= this.threshold) {
          if (!this.isVisible) {
            this.animateIn();
            this.isVisible = true;
            // Once animated in, disconnect observer for this element
            // so it won't animate out when scrolled away
            if (this.observer) {
              this.observer.disconnect();
            }
          }
        }
      });
    }, options);

    this.observer.observe(this.el.nativeElement);
  }

  private animateIn() {
    const element = this.el.nativeElement;

    // Apply stagger delay if it's part of a group
    if (this.stagger) {
      const index = this.getElementIndex();
      const totalDelay = this.animationDelay + (index * this.staggerDelay);
      this.renderer.setStyle(element, 'transition-delay', `${totalDelay}s`);
    }

    // Animate to visible state
    requestAnimationFrame(() => {
      switch (this.animationType) {
        case 'fade':
          this.renderer.setStyle(element, 'opacity', '1');
          break;
        case 'slide':
          this.renderer.setStyle(element, 'opacity', '1');
          this.renderer.setStyle(element, 'transform', 'translateY(0)');
          break;
        case 'slideLeft':
          this.renderer.setStyle(element, 'opacity', '1');
          this.renderer.setStyle(element, 'transform', 'translateX(0)');
          break;
        case 'slideRight':
          this.renderer.setStyle(element, 'opacity', '1');
          this.renderer.setStyle(element, 'transform', 'translateX(0)');
          break;
        case 'zoom':
          this.renderer.setStyle(element, 'opacity', '1');
          this.renderer.setStyle(element, 'transform', 'scale(1)');
          break;
      }

      this.renderer.addClass(element, 'scroll-animated-in');
    });
  }

  // animateOut method removed - animations now only happen once
  // Elements stay visible after animating in

  private getElementIndex(): number {
    const parent = this.el.nativeElement.parentElement;
    if (!parent) return 0;

    const siblings = Array.from(parent.children);
    return siblings.indexOf(this.el.nativeElement);
  }
}