import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-analysis-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex; flex-direction:column; flex:1; min-height:0; height:100%; overflow:hidden;' }
})
export class AnalysisHistoryComponent {
  private _history = signal<any[]>([]);

  @Input()
  set analysisHistory(value: any[]) {
    this._history.set(value || []);
  }
  
  get analysisHistory(): any[] {
    return this._history();
  }

  @Output() loadPastAnalysisAction = new EventEmitter<any>();

  // Filter Signals
  filterDate = signal<string>('');
  filterModel = signal<string>('');
  filterUrl = signal<string>('');
  filterLlmKey = signal<string>('');
  filterPat = signal<string>('');

  // Computed slicing for robust filtering
  filteredHistory = computed(() => {
    let data = this._history();
    const dDate = this.filterDate().toLowerCase();
    const dModel = this.filterModel().toLowerCase();
    const dUrl = this.filterUrl().toLowerCase();
    const dLlmKey = this.filterLlmKey().toLowerCase();
    const dPat = this.filterPat().toLowerCase();

    if (dDate) {
      data = data.filter(h => new Date(h.created_at).toLocaleDateString().toLowerCase().includes(dDate));
    }
    if (dModel) {
      data = data.filter(h => h.model && h.model.toLowerCase().includes(dModel));
    }
    if (dUrl) {
      data = data.filter(h => (h.repo || '').toLowerCase().includes(dUrl) || (h.github_url || '').toLowerCase().includes(dUrl));
    }
    if (dLlmKey) {
      data = data.filter(h => (h.api_key || '').toLowerCase().includes(dLlmKey));
    }
    if (dPat) {
      data = data.filter(h => (h.github_token || '').toLowerCase().includes(dPat));
    }

    return data;
  });

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  
  totalPages = computed(() => Math.ceil(this.filteredHistory().length / this.pageSize()) || 1);

  paginatedHistory = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredHistory().slice(start, start + this.pageSize());
  });

  goToFirstPage() {
    this.currentPage.set(1);
  }

  goToLastPage() {
    this.currentPage.set(this.totalPages());
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  changePageSize(size: string) {
    this.pageSize.set(parseInt(size, 10));
    this.currentPage.set(1);
  }

  // Reset to page 1 on any filter change
  onFilterChange() {
    this.currentPage.set(1);
  }

  // Securely mask API and GitHub PAT keys on screens
  maskToken(token: string | null | undefined): string {
    if (!token) return 'None';
    if (token.length <= 4) return '****';
    return '******' + token.slice(-4);
  }
}
