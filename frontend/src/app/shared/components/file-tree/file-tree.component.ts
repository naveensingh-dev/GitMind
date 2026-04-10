import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TreeNode {
  name: string;
  path?: string;
  children: TreeNode[];
  isOpen: boolean;
  isFile: boolean;
  level: number;
}

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="file-tree-container">
      <div class="tree-node" *ngFor="let node of flatTree()" 
           [style.padding-left.px]="node.level * 12 + 12"
           [class.file]="node.isFile"
           [class.folder]="!node.isFile"
           [class.active]="selectedPath === node.path"
           (click)="onNodeClick(node)">
        
        <!-- Indentation Line Guides -->
        <div class="indent-guide" *ngFor="let i of [].constructor(node.level)" 
             [style.left.px]="i * 12 + 18"></div>

        <span class="chevron" *ngIf="!node.isFile" [class.open]="node.isOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
        
        <span class="icon">
          <ng-container *ngIf="node.isFile; else folderIcon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-svg"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          </ng-container>
          <ng-template #folderIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="folder-svg"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </ng-template>
        </span>
        
        <span class="name">{{ node.name }}</span>
      </div>
    </div>
  `,
  styles: [`
    .file-tree-container {
      font-family: var(--sans);
      font-size: 13px;
      color: var(--text2);
      user-select: none;
      position: relative;
    }
    .tree-node {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      cursor: pointer;
      gap: 10px;
      border-radius: 6px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      margin-bottom: 1px;
    }
    .tree-node:hover {
      background: rgba(255, 255, 255, 0.04);
      color: #fff;
    }
    .tree-node.active {
      background: rgba(0, 255, 163, 0.08);
      color: var(--g);
      font-weight: 500;
    }
    .tree-node.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      background: var(--g);
      border-radius: 0 4px 4px 0;
      box-shadow: 0 0 8px var(--g);
    }
    .indent-guide {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(255, 255, 255, 0.05);
      pointer-events: none;
    }
    .chevron {
      width: 12px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
      opacity: 0.5;
    }
    .chevron svg { width: 100%; height: 100%; }
    .chevron.open { transform: rotate(90deg); opacity: 0.8; }
    .icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .icon svg { width: 100%; height: 100%; opacity: 0.7; }
    .file-svg { color: var(--text3); }
    .folder-svg { color: var(--cyan); opacity: 0.6; }
    .tree-node.active .file-svg { color: var(--g); opacity: 1; }
    .name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.01em;
    }
  `]
})
export class FileTreeComponent {
  @Input() set files(filePaths: string[]) {
    this.buildTree(filePaths);
  }
  @Input() selectedPath: string | null = null;
  @Output() fileSelect = new EventEmitter<string>();

  private rootNodes = signal<TreeNode[]>([]);

  flatTree = computed(() => {
    const flat: TreeNode[] = [];
    const flatten = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        flat.push(node);
        if (!node.isFile && node.isOpen) {
          flatten(node.children);
        }
      }
    };
    flatten(this.rootNodes());
    return flat;
  });

  private buildTree(paths: string[]) {
    const root: TreeNode[] = [];
    
    paths.forEach(path => {
      const parts = path.split('/');
      let currentLevel = root;
      
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        let node = currentLevel.find(n => n.name === part);
        
        if (!node) {
          node = {
            name: part,
            path: isFile ? path : undefined,
            children: [],
            isOpen: true,
            isFile: isFile,
            level: index
          };
          currentLevel.push(node);
          // Sort folders first, then alphabetically
          currentLevel.sort((a, b) => {
            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
            return a.name.localeCompare(b.name);
          });
        }
        currentLevel = node.children;
      });
    });
    
    this.rootNodes.set(root);
  }

  onNodeClick(node: TreeNode) {
    if (node.isFile) {
      this.fileSelect.emit(node.path);
    } else {
      node.isOpen = !node.isOpen;
      this.rootNodes.update(nodes => [...nodes]); // Trigger re-computation
    }
  }
}
