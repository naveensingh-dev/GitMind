import { Directive, ElementRef, HostListener, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appDraggable]',
  standalone: true
})
export class DraggableDirective implements OnInit {
  private element = inject(ElementRef).nativeElement as HTMLElement;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private initialLeft = 0;
  private initialTop = 0;
  
  private currentHeader: HTMLElement | null = null;

  ngOnInit() {
    this.element.style.position = 'fixed';
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    // Only allow left click
    if (event.button !== 0) return;
    
    const target = event.target as HTMLElement;
    const header = target.closest('.floating-header') as HTMLElement;
    
    // Only drag by the header
    if (!header) return;

    // Ignore clicks on buttons inside header
    if (target.closest('button')) return;

    this.isDragging = true;
    this.currentHeader = header;
    this.currentHeader.style.cursor = 'grabbing';

    this.startX = event.clientX;
    this.startY = event.clientY;

    const rect = this.element.getBoundingClientRect();
    this.initialLeft = rect.left;
    this.initialTop = rect.top;

    // Remove bottom/right constraints so left/top can govern positioning freely
    this.element.style.bottom = 'auto';
    this.element.style.right = 'auto';
    this.element.style.transform = 'none';

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    
    event.preventDefault(); // Stop text selection
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.isDragging) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    const newLeft = this.initialLeft + dx;
    const newTop = this.initialTop + dy;

    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
  };

  private onMouseUp = () => {
    this.isDragging = false;
    if (this.currentHeader) {
      this.currentHeader.style.cursor = 'default';
      this.currentHeader = null;
    }

    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };
}
