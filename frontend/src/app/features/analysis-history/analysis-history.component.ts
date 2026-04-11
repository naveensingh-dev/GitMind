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

  /** Active tab: 'reviewed' | 'failed' */
  activeTab = signal<'reviewed' | 'failed'>('reviewed');

  // Filter Signals
  filterDate = signal<string>('');
  filterModel = signal<string>('');
  filterUrl = signal<string>('');
  filterLlmKey = signal<string>('');
  filterPat = signal<string>('');
  filterFailReason = signal<string>('');

  // ── Reviewed PRs: approval_status !== 'failed' ──────────────────────────────
  reviewedHistory = computed(() => {
    let data = this._history().filter(h => h.approval_status !== 'failed');
    const dDate   = this.filterDate().toLowerCase();
    const dModel  = this.filterModel().toLowerCase();
    const dUrl    = this.filterUrl().toLowerCase();
    const dLlmKey = this.filterLlmKey().toLowerCase();
    const dPat    = this.filterPat().toLowerCase();

    if (dDate)   data = data.filter(h => new Date(h.created_at).toLocaleDateString().toLowerCase().includes(dDate));
    if (dModel)  data = data.filter(h => h.model && h.model.toLowerCase().includes(dModel));
    if (dUrl)    data = data.filter(h => (h.repo || '').toLowerCase().includes(dUrl) || (h.github_url || '').toLowerCase().includes(dUrl));
    if (dLlmKey) data = data.filter(h => (h.api_key || '').toLowerCase().includes(dLlmKey));
    if (dPat)    data = data.filter(h => (h.github_token || '').toLowerCase().includes(dPat));

    return data;
  });

  // ── Failed PRs: approval_status === 'failed' ─────────────────────────────────
  failedHistory = computed(() => {
    let data = this._history().filter(h => h.approval_status === 'failed');
    const dDate        = this.filterDate().toLowerCase();
    const dModel       = this.filterModel().toLowerCase();
    const dUrl         = this.filterUrl().toLowerCase();
    const dFailReason  = this.filterFailReason().toLowerCase();

    if (dDate)       data = data.filter(h => new Date(h.created_at).toLocaleDateString().toLowerCase().includes(dDate));
    if (dModel)      data = data.filter(h => h.model && h.model.toLowerCase().includes(dModel));
    if (dUrl)        data = data.filter(h => (h.repo || '').toLowerCase().includes(dUrl) || (h.github_url || '').toLowerCase().includes(dUrl));
    if (dFailReason) data = data.filter(h => (h.error_message || '').toLowerCase().includes(dFailReason));

    return data;
  });

  // Active dataset depends on current tab
  filteredHistory = computed(() =>
    this.activeTab() === 'reviewed' ? this.reviewedHistory() : this.failedHistory()
  );

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  
  totalPages = computed(() => Math.ceil(this.filteredHistory().length / this.pageSize()) || 1);

  paginatedHistory = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredHistory().slice(start, start + this.pageSize());
  });

  switchTab(tab: 'reviewed' | 'failed') {
    this.activeTab.set(tab);
    this.currentPage.set(1);
    // Reset all filters on switch
    this.filterDate.set('');
    this.filterModel.set('');
    this.filterUrl.set('');
    this.filterLlmKey.set('');
    this.filterPat.set('');
    this.filterFailReason.set('');
  }

  goToFirstPage() { this.currentPage.set(1); }
  goToLastPage()  { this.currentPage.set(this.totalPages()); }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  changePageSize(size: string) {
    this.pageSize.set(parseInt(size, 10));
    this.currentPage.set(1);
  }

  onFilterChange() { this.currentPage.set(1); }

  /** Truncate long error strings for table display */
  truncate(str: string | null | undefined, max = 80): string {
    if (!str) return '—';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  /** Classify error into a user-friendly category */
  classifyError(msg: string | null | undefined): string {
    if (!msg) return 'Unknown Error';
    const m = msg.toLowerCase();
    if (m.includes('429') || m.includes('quota') || m.includes('exhausted') || m.includes('rate_limit')) return 'Quota / Rate Limit';
    if (m.includes('401') || m.includes('api key') || m.includes('unauthorized') || m.includes('invalid api key')) return 'Invalid API Key';
    if (m.includes('403') || m.includes('forbidden') || m.includes('permission denied')) return 'Permission Denied';
    if (m.includes('404') || m.includes('not_found') || m.includes('not found') || m.includes('is not supported')) return 'Model Not Found';
    if (m.includes('context') || m.includes('too many tokens') || m.includes('maximum context length')) return 'Context Limit';
    if (m.includes('token') && m.includes('github')) return 'GitHub Token Error';
    return 'Runtime Error';
  }

  /** Securely mask API and GitHub PAT keys on screens */
  maskToken(token: string | null | undefined): string {
    if (!token) return 'None';
    if (token.length <= 4) return '****';
    return '******' + token.slice(-4);
  }
}
