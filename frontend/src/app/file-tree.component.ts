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
           [style.padding-left.px]="node.level * 16"
           [class.file]="node.isFile"
           [class.folder]="!node.isFile"
           [class.active]="selectedPath === node.path"
           (click)="onNodeClick(node)">
        <span class="chevron" *ngIf="!node.isFile" [class.open]="node.isOpen">▶</span>
        <span class="icon">{{ node.isFile ? '📄' : '📁' }}</span>
        <span class="name">{{ node.name }}</span>
      </div>
    </div>
  `,
  styles: [`
    .file-tree-container {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--text2);
      user-select: none;
    }
    .tree-node {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      cursor: pointer;
      gap: 6px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .tree-node:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
    }
    .tree-node.active {
      background: rgba(0, 255, 163, 0.1);
      color: var(--g);
    }
    .chevron {
      font-size: 8px;
      transition: transform 0.2s;
      width: 10px;
      display: inline-block;
    }
    .chevron.open {
      transform: rotate(90deg);
    }
    .icon {
      font-size: 14px;
      opacity: 0.7;
    }
    .name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
