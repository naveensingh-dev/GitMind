import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewItem } from '../../../core/models';

@Component({
  selector: 'app-review-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './review-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReviewPanelComponent {
  @Input() items: ReviewItem[] = [];
  @Input() categoryName: string = '';
  @Output() pushToGithub = new EventEmitter<ReviewItem>();
  @Output() applyFix = new EventEmitter<ReviewItem>();

  onPushToGithub(item: ReviewItem) {
    this.pushToGithub.emit(item);
  }

  onApplyFix(item: ReviewItem) {
    this.applyFix.emit(item);
  }

  trackByItem(index: number, item: ReviewItem) {
    return item.issue;
  }
}
