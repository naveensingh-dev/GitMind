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

  /** Active tab: 'reviewed' | 'failed' | 'partial' */
  activeTab = signal<'reviewed' | 'failed' | 'partial'>('reviewed');

  // Filter Signals
  filterDate = signal<string>('');
  filterModel = signal<string>('');
  filterUrl = signal<string>('');
  filterLlmKey = signal<string>('');
  filterPat = signal<string>('');
  filterFailReason = signal<string>('');

  // ── Reviewed PRs: approval_status !== 'failed' and no error_message ──────────────────────────────
  reviewedHistory = computed(() => {
    let data = this._history().filter(h => h.approval_status !== 'failed' && !h.error_message);
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

  // ── Partial Pass PRs: approval_status !== 'failed' but has error_message ──────────────────────────
  partialHistory = computed(() => {
    let data = this._history().filter(h => h.approval_status !== 'failed' && !!h.error_message);
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
  filteredHistory = computed(() => {
    const tab = this.activeTab();
    if (tab === 'reviewed') return this.reviewedHistory();
    if (tab === 'partial') return this.partialHistory();
    return this.failedHistory();
  });

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  
  totalPages = computed(() => Math.ceil(this.filteredHistory().length / this.pageSize()) || 1);

  paginatedHistory = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredHistory().slice(start, start + this.pageSize());
  });

  switchTab(tab: 'reviewed' | 'failed' | 'partial') {
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

  /** Export current tab's data as a CSV file */
  exportCsv() {
    const rows = this.filteredHistory();
    const isReviewed = this.activeTab() === 'reviewed';

    const headers = isReviewed
      ? ['ID', 'Date', 'Repository', 'PR URL', 'Model', 'Provider', 'Status', 'Confidence', 'Security Issues', 'Performance Issues', 'Style Issues', 'High Severity']
      : ['ID', 'Date', 'Repository', 'PR URL', 'Model', 'Provider', 'Error Type', 'Failure Reason'];

    const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const csv = [
      headers.join(','),
      ...rows.map(h => {
        if (isReviewed) {
          return [
            h.id,
            escape(h.created_at),
            escape(h.repo),
            escape(h.github_url),
            escape(h.model),
            escape(h.provider),
            escape(h.approval_status),
            h.confidence_score ?? 0,
            h.security_count ?? 0,
            h.performance_count ?? 0,
            h.style_count ?? 0,
            h.high_severity_count ?? 0,
          ].join(',');
        } else {
          return [
            h.id,
            escape(h.created_at),
            escape(h.repo),
            escape(h.github_url),
            escape(h.model),
            escape(h.provider),
            escape(this.classifyError(h.error_message)),
            escape(h.error_message),
          ].join(',');
        }
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitmind-${this.activeTab()}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Securely mask API and GitHub PAT keys on screens */
  maskToken(token: string | null | undefined): string {
    if (!token) return 'None';
    if (token.length <= 4) return '****';
    return '******' + token.slice(-4);
  }

  /** Export reviewed findings as SARIF 2.1.0 (GitHub Code Scanning format) */
  exportSarif(analysisRow: any) {
    const review = analysisRow.review_json ? JSON.parse(analysisRow.review_json) : null;
    if (!review) return;

    const results: any[] = [];
    const allFindings = [
      ...(review.security || []).map((i: any) => ({ ...i, category: 'security' })),
      ...(review.performance || []).map((i: any) => ({ ...i, category: 'performance' })),
      ...(review.style || []).map((i: any) => ({ ...i, category: 'style' })),
    ];

    for (const finding of allFindings) {
      results.push({
        ruleId: `gitmind/${finding.category}`,
        level: finding.severity === 'high' ? 'error' : finding.severity === 'medium' ? 'warning' : 'note',
        message: { text: `${finding.issue}\n\nFix: ${finding.fix}` },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: finding.file_path || 'unknown' },
            region: { startLine: finding.line_number || 1 }
          }
        }]
      });
    }

    const sarif = {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'GitMind',
            version: '1.0.0',
            informationUri: 'https://github.com/gitmind',
            rules: [
              { id: 'gitmind/security', name: 'SecurityReview', shortDescription: { text: 'Security analysis by GitMind AI' } },
              { id: 'gitmind/performance', name: 'PerformanceReview', shortDescription: { text: 'Performance analysis by GitMind AI' } },
              { id: 'gitmind/style', name: 'StyleReview', shortDescription: { text: 'Code style analysis by GitMind AI' } },
            ]
          }
        },
        results
      }]
    };

    const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitmind-${analysisRow.repo?.replace('/', '-')}-${new Date().toISOString().split('T')[0]}.sarif`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
