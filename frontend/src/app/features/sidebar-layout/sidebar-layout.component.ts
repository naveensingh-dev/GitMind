import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileTreeComponent } from '../../shared/components/file-tree/file-tree.component';

@Component({
  selector: 'app-sidebar-layout',
  standalone: true,
  imports: [CommonModule, FileTreeComponent],
  templateUrl: './sidebar-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: contents; }
  `]
})
export class SidebarLayoutComponent {
  @Input() diffInput: string = '';
  @Input() filePaths: any[] = [];
  @Input() selectedFilePath: string | null = null;

  @Output() scrollToFileAction = new EventEmitter<string>();
}
