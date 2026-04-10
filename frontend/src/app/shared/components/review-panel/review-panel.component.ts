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
  @Input() stagedItems: ReviewItem[] = [];   // items currently in staging cart
  @Output() pushToGithub = new EventEmitter<ReviewItem>();
  @Output() applyFix = new EventEmitter<ReviewItem>();
  @Output() toggleStage = new EventEmitter<ReviewItem>();   // stage or unstage
  @Output() dismissItem = new EventEmitter<ReviewItem>();

  isStaged(item: ReviewItem): boolean {
    return this.stagedItems.some(s => s.file_path === item.file_path && s.issue === item.issue);
  }

  onPushToGithub(item: ReviewItem) {
    this.pushToGithub.emit(item);
  }

  onApplyFix(item: ReviewItem) {
    this.applyFix.emit(item);
  }

  onToggleStage(item: ReviewItem) {
    this.toggleStage.emit(item);
  }

  onDismiss(item: ReviewItem) {
    this.dismissItem.emit(item);
  }

  trackByItem(index: number, item: ReviewItem) {
    return item.issue;
  }
}
