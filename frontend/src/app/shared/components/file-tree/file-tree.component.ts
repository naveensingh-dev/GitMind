import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiffFile } from '../../../core/models';

type FileStatus = 'added' | 'deleted' | 'modified';

interface TreeNode {
  name: string;
  path: string;        // full path for files, folder path for folders
  isFile: boolean;
  level: number;
  isOpen: boolean;
  status: FileStatus;
  additions: number;
  deletions: number;
  children: Map<string, TreeNode>;  // Use Map for O(1) lookup, no sort-corruption
}

interface FlatNode extends Omit<TreeNode, 'children'> {
  hasChildren: boolean;
}

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="file-tree">

      <!-- Summary header -->
      <div class="tree-header">
        <span class="stat-pill added"   *ngIf="summary().added   > 0"><span class="pill-dot"></span>{{ summary().added }} added</span>
        <span class="stat-pill modified" *ngIf="summary().modified > 0"><span class="pill-dot"></span>{{ summary().modified }} changed</span>
        <span class="stat-pill deleted"  *ngIf="summary().deleted > 0"><span class="pill-dot"></span>{{ summary().deleted }} deleted</span>
      </div>

      <!-- Tree rows -->
      <div
        *ngFor="let node of flatNodes(); trackBy: trackByPath"
        class="tree-row"
        [class.is-file]="node.isFile"
        [class.is-folder]="!node.isFile"
        [class.is-active]="selectedPath === node.path"
        [class.st-added]="node.isFile && node.status === 'added'"
        [class.st-deleted]="node.isFile && node.status === 'deleted'"
        [class.st-modified]="node.isFile && node.status === 'modified'"
        [style.padding-left.px]="node.level * 14 + 8"
        (click)="onRowClick(node)">

        <!-- Vertical indent guides -->
        <span
          *ngFor="let g of range(node.level)"
          class="indent-line"
          [style.left.px]="g * 14 + 15">
        </span>

        <!-- Chevron (folders only) -->
        <span class="chevron" [class.open]="node.isOpen" *ngIf="!node.isFile && node.hasChildren">
          <svg viewBox="0 0 10 10" fill="currentColor">
            <path d="M3 2l4 3-4 3V2z"/>
          </svg>
        </span>
        <span class="chevron-placeholder" *ngIf="node.isFile || !node.hasChildren"></span>

        <!-- Icon -->
        <span class="node-icon">
          <ng-container *ngIf="node.isFile">
            <svg class="icon-file" [class.icon-added]="node.status==='added'" [class.icon-deleted]="node.status==='deleted'"
                 viewBox="0 0 16 16" fill="none">
              <path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5L9 1z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M9 1v4h4" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </ng-container>
          <ng-container *ngIf="!node.isFile">
            <svg class="icon-folder" viewBox="0 0 16 16" fill="none">
              <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </ng-container>
        </span>

        <!-- Status badge (files only) -->
        <span class="badge badge-a" *ngIf="node.isFile && node.status === 'added'">A</span>
        <span class="badge badge-m" *ngIf="node.isFile && node.status === 'modified'">M</span>
        <span class="badge badge-d" *ngIf="node.isFile && node.status === 'deleted'">D</span>

        <!-- Name -->
        <span class="node-name" [title]="node.path">{{ node.name }}</span>


      </div>
    </div>
  `,
  styles: [`
    .file-tree { font-family: var(--sans); font-size: 13px; font-weight: 500; color: #ffffff; user-select: none; }

    /* ── Header ── */
    .tree-header {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 12px 14px 11px; border-bottom: 1px solid var(--border);
    }
    .stat-pill {
      display: flex; align-items: center; gap: 6px;
      font-family: var(--mono); font-size: 11px; font-weight: 700;
      padding: 3px 10px; border-radius: 20px; letter-spacing: 0.04em;
    }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; }
    .stat-pill.added    { color: #00ffa3; background: rgba(0,255,163,0.1); border: 1px solid rgba(0,255,163,0.3); }
    .stat-pill.added    .pill-dot { background: #00ffa3; box-shadow: 0 0 8px #00ffa3; }
    .stat-pill.modified { color: #fbbf24; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); }
    .stat-pill.modified .pill-dot { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
    .stat-pill.deleted  { color: #f87171; background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); }
    .stat-pill.deleted  .pill-dot { background: #f87171; box-shadow: 0 0 8px #f87171; }

    /* ── Row ── */
    .tree-row {
      display: flex; align-items: center; gap: 8px;
      padding-top: 6px; padding-bottom: 6px; padding-right: 10px;
      cursor: pointer; position: relative; border-radius: 6px;
      transition: background 0.15s, color 0.15s;
      min-width: 0;
      color: rgba(255, 255, 255, 0.85); /* Default crisp white for folders */
    }
    .tree-row:hover { background: rgba(255,255,255,0.08); color: #ffffff; }
    .tree-row.is-active {
      background: rgba(0,255,163,0.12);
      color: #00ffa3;
    }
    .tree-row.is-active::before {
      content: ''; position: absolute;
      left: 0; top: 3px; bottom: 3px; width: 3px;
      background: #00ffa3; border-radius: 0 3px 3px 0;
      box-shadow: 0 0 8px #00ffa3;
    }

    /* File status tinting */
    .tree-row.is-file.st-added   { color: #00ffa3; font-weight: 600; text-shadow: 0 0 8px rgba(0,255,163,0.2); }
    .tree-row.is-file.st-deleted { color: #f87171; text-decoration: line-through; text-decoration-color: rgba(248,113,113,0.6); }
    .tree-row.is-file.st-modified { color: #ffffff; font-weight: 500; }

    /* Indent guides */
    .indent-line {
      position: absolute; top: 0; bottom: 0;
      width: 1px; background: rgba(255,255,255,0.1);
      pointer-events: none;
    }

    /* Chevron */
    .chevron {
      width: 10px; height: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s; opacity: 0.8; color: #ffffff;
    }
    .chevron svg { width: 100%; height: 100%; }
    .chevron.open { transform: rotate(90deg); opacity: 1; }
    .chevron-placeholder { width: 10px; flex-shrink: 0; }

    /* Icons */
    .node-icon { width: 14px; height: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .node-icon svg { width: 100%; height: 100%; }
    .icon-file   { color: rgba(255,255,255,0.7); }
    .icon-file.icon-added   { color: #00ffa3; }
    .icon-file.icon-deleted { color: #f87171; }
    .icon-folder { color: rgba(56,212,245,0.9); }
    .tree-row.is-active .icon-file  { color: #00ffa3; filter: drop-shadow(0 0 4px #00ffa3); }
    .tree-row.is-active .icon-folder { color: #00ffa3; filter: drop-shadow(0 0 4px #00ffa3); }

    /* Status badge */
    .badge {
      font-family: var(--mono); font-size: 8.5px; font-weight: 700;
      width: 14px; height: 14px; border-radius: 3px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .badge-a { background: rgba(0,255,163,0.15);  color: #00ffa3;  border: 1px solid rgba(0,255,163,0.25); }
    .badge-m { background: rgba(251,191,36,0.12); color: #fbbf24;  border: 1px solid rgba(251,191,36,0.22); }
    .badge-d { background: rgba(248,113,113,0.12); color: #f87171; border: 1px solid rgba(248,113,113,0.22); }

    /* Name */
    .node-name {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      letter-spacing: 0.005em;
    }

    /* Diff bar */
    .diff-bar { display: flex; gap: 1px; flex-shrink: 0; height: 7px; overflow: hidden; border-radius: 1px; }
    .bar-add { background: rgba(0,255,163,0.65); min-width: 1px; height: 100%; border-radius: 1px 0 0 1px; }
    .bar-del { background: rgba(248,113,113,0.65); min-width: 1px; height: 100%; border-radius: 0 1px 1px 0; }
  `]
})
export class FileTreeComponent {
  @Input() set diffFiles(files: DiffFile[]) {
    if (files?.length) {
      this._build(files);
    }
  }

  // Legacy string-path fallback — convert to minimal DiffFile[]
  @Input() set files(paths: string[]) {
    if (paths?.length && !this._hasRealData) {
      this._build(paths.map(p => ({ path: p, additions: 1, deletions: 0, hunks: [], isOpen: true })));
    }
  }

  @Input() selectedPath: string | null = null;
  @Output() fileSelect = new EventEmitter<string>();

  private _hasRealData = false;
  private _rootMap = signal(new Map<string, TreeNode>());  // top-level nodes by name

  // ── Computed flat list for *ngFor ──────────────────────────────────────────
  flatNodes = computed<FlatNode[]>(() => {
    const result: FlatNode[] = [];
    this._flatten(Array.from(this._rootMap().values()), result);
    return result;
  });

  // ── Overall PR summary ────────────────────────────────────────────────────
  summary = computed(() => {
    let added = 0, modified = 0, deleted = 0;
    const walk = (map: Map<string, TreeNode>) => {
      for (const n of map.values()) {
        if (n.isFile) {
          if (n.status === 'added') added++;
          else if (n.status === 'deleted') deleted++;
          else modified++;
        } else {
          walk(n.children);
        }
      }
    };
    walk(this._rootMap());
    return { added, modified, deleted };
  });

  range(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }
  trackByPath(_: number, n: FlatNode) { return n.path; }

  barWidth(add: number, del: number, type: 'add' | 'del'): number {
    const total = add + del;
    if (total === 0) return 0;
    const maxPx = 28;
    return Math.max(1, Math.round((type === 'add' ? add : del) / total * maxPx));
  }

  onRowClick(node: FlatNode) {
    if (node.isFile) {
      this.fileSelect.emit(node.path);
    } else {
      // Toggle folder open/closed via functional update to trigger reactivity
      this._rootMap.update(root => {
        const target = this._findNode(root, node.path);
        if (target) target.isOpen = !target.isOpen;
        return new Map(root);  // new Map reference = signal re-triggers
      });
    }
  }

  // ── Build tree from DiffFile[] ─────────────────────────────────────────────
  private _build(files: DiffFile[]) {
    this._hasRealData = true;

    // Deduplicate by path
    const seen = new Set<string>();
    const unique = files.filter(f => {
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    });

    const root = new Map<string, TreeNode>();

    for (const file of unique) {
      const parts = file.path.split('/').filter(p => p.length > 0);
      if (parts.length === 0) continue;

      const status = this._getStatus(file);
      let currentMap = root;
      let folderPath = '';

      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const isFile = i === parts.length - 1;
        const nodePath = folderPath ? `${folderPath}/${name}` : name;
        folderPath = nodePath;

        if (!currentMap.has(name)) {
          const node: TreeNode = {
            name,
            path: nodePath,
            isFile,
            level: i,
            isOpen: true,
            status: isFile ? status : 'modified',
            additions: isFile ? file.additions : 0,
            deletions: isFile ? file.deletions : 0,
            children: new Map(),
          };
          currentMap.set(name, node);
        } else if (isFile) {
          // Update existing node with real statistics
          const existing = currentMap.get(name)!;
          existing.status = status;
          existing.additions = file.additions;
          existing.deletions = file.deletions;
        }

        currentMap = currentMap.get(name)!.children;
      }
    }

    this._rootMap.set(root);
  }

  private _getStatus(file: DiffFile): FileStatus {
    if (file.additions > 0 && file.deletions === 0) return 'added';
    if (file.deletions > 0 && file.additions === 0) return 'deleted';
    return 'modified';
  }

  private _flatten(nodes: TreeNode[], result: FlatNode[]) {
    // Sort: folders first, then alphabetically
    const sorted = [...nodes].sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const node of sorted) {
      result.push({
        name: node.name,
        path: node.path,
        isFile: node.isFile,
        level: node.level,
        isOpen: node.isOpen,
        status: node.status,
        additions: node.additions,
        deletions: node.deletions,
        hasChildren: node.children.size > 0,
      });
      if (!node.isFile && node.isOpen) {
        this._flatten(Array.from(node.children.values()), result);
      }
    }
  }

  private _findNode(map: Map<string, TreeNode>, path: string): TreeNode | null {
    for (const node of map.values()) {
      if (node.path === path) return node;
      if (!node.isFile) {
        const found = this._findNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }
}
