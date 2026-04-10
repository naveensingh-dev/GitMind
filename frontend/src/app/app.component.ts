import { Component, signal, computed, inject, OnInit, AfterViewChecked } from '@angular/core';
import mermaid from 'mermaid';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { ApiService, LogEntry } from './core/api.service';
import { HeaderComponent } from './shared/components/header/header.component';
import { ActivityLogComponent } from './shared/components/activity-log/activity-log.component';
import { FileTreeComponent } from './shared/components/file-tree/file-tree.component';
import { AnalyticsDashboardComponent } from './features/analytics/analytics.component';
import { ReviewPanelComponent } from './shared/components/review-panel/review-panel.component';
import { DiffViewerComponent } from './features/diff-viewer/diff-viewer.component';
import { SummaryTabComponent } from './features/summary-tab/summary-tab.component';
import { PipelineVisualizerComponent } from './features/pipeline-visualizer/pipeline-visualizer.component';
import { ThinkingLogsComponent } from './features/thinking-logs/thinking-logs.component';
import { AutofixPanelComponent } from './features/autofix-panel/autofix-panel.component';
import { TestsPanelComponent } from './features/tests-panel/tests-panel.component';
import { AgentControlsComponent } from './features/agent-controls/agent-controls.component';
import { OverlaysComponent } from './features/overlays/overlays.component';
import { AnalysisHistoryComponent } from './features/analysis-history/analysis-history.component';
import { HumanFeedbackComponent } from './features/human-feedback/human-feedback.component';
import { ArchTabComponent } from './features/arch-tab/arch-tab.component';
import { RawReportTabComponent } from './features/raw-report-tab/raw-report-tab.component';

import { SidebarLayoutComponent } from './features/sidebar-layout/sidebar-layout.component';
import { ReportHeaderComponent } from './features/report-header/report-header.component';
import { TabsBarComponent } from './features/tabs-bar/tabs-bar.component';

import { GitMindStateService } from './core/state.service';

import {
  ReviewItem,
  ReviewReport,
  DiffLine,
  DiffHunk,
  DiffFile,
  DashboardMetrics
} from './core/models';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, ActivityLogComponent, AnalyticsDashboardComponent, ReviewPanelComponent, DiffViewerComponent, SummaryTabComponent, PipelineVisualizerComponent, ThinkingLogsComponent, AutofixPanelComponent, TestsPanelComponent, AgentControlsComponent, OverlaysComponent, AnalysisHistoryComponent, HumanFeedbackComponent, ArchTabComponent, RawReportTabComponent, SidebarLayoutComponent, ReportHeaderComponent, TabsBarComponent],
  templateUrl: './app.component.html',
})
export class App implements OnInit {

  private sanitizer = inject(DomSanitizer);
  private apiService = inject(ApiService);

  public state = inject(GitMindStateService);

  // --- UI & STATE SIGNALS (Facade to State Service) ---

  prUrl = this.state.prUrl;
  diffInput = this.state.diffInput;
  isAnalyzing = this.state.isAnalyzing;
  currentTab = this.state.currentTab;
  logs = this.state.logs;
  analysisData = this.state.analysisData;
  critiqueData = this.state.critiqueData;
  autoFixes = this.state.autoFixes;
  generatedTests = this.state.generatedTests;
  archReview = this.state.archReview;
  errorMessage = this.state.errorMessage;
  successMessage = this.state.successMessage;
  selectedFilePath = this.state.selectedFilePath;
  analysisHistory = this.state.analysisHistory;
  dashboardMetrics = this.state.dashboardMetrics;
  tabLoading = this.state.tabLoading;

  isLeftPanelCollapsed = signal(false);

  toggleLeftPanel() {
    this.isLeftPanelCollapsed.set(!this.isLeftPanelCollapsed());
  }

  // Human-in-the-loop signals
  threadId = this.state.threadId;
  isAwaitingFeedback = this.state.isAwaitingFeedback;
  userFeedback = this.state.userFeedback;

  // Model Selection & Credentials
  selectedProvider = this.state.selectedProvider;
  selectedModel = this.state.selectedModel;
  userApiKey = this.state.userApiKey;
  githubTokenInput = '';
  githubToken = this.state.githubToken;

  // --- STAGING CART ---
  stagedFixes = signal<{ file_path: string; fixed_code: string; issue: string; item: ReviewItem }[]>([]);
  stagedItems = computed(() => this.stagedFixes().map(f => f.item));
  isPushingFixes = signal(false);

  appendLog(type: LogEntry['type'], msg: string) {
    this.state.appendLog(type, msg);
  }

  clearError() {
    this.state.clearError();
  }

  clearSuccess() {
    this.state.clearSuccess();
  }

  /**
   * Updates the GitHub token and persists it to local storage.
   */
  onTokenInputChange(val: string) {
    this.githubTokenInput = val;
    this.githubToken.set(val);
    this.saveSettings();
    if (val) {
      this.appendLog('success', '✓ GitHub PAT updated and saved locally.');
    }
  }

  /**
   * Model Configuration Map
   */
  modelOptions: Record<string, { label: string, value: string }[]> = {
    gemini: [
      // Gemini 3 Series
      { label: 'Gemini 3.1 Pro (Preview)', value: 'gemini-3.1-pro-preview' },
      { label: 'Gemini 3.1 Flash-Lite (Preview)', value: 'gemini-3.1-flash-lite-preview' },
      { label: 'Gemini 3 Flash (Preview)', value: 'gemini-3-flash-preview' },

      // Gemini 2.5 Series
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.5 Flash-Lite', value: 'gemini-2.5-flash-lite' },

      // Gemini 2.0 Series
      { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
      { label: 'Gemini 2.0 Flash-Lite', value: 'gemini-2.0-flash-lite' },
      { label: 'Gemini 2.0 Flash (Latest)', value: 'gemini-2.0-flash-001' },

      // Gemini 1.5 Series
      { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
      { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
      { label: 'Gemini 1.5 Flash (Latest)', value: 'gemini-flash-latest' },

      // Legacy / Stable
      { label: 'Gemini 1.0 Pro', value: 'gemini-pro-latest' }
    ],
    openai: [
      { label: 'o3-mini', value: 'o3-mini' },
      { label: 'o1 (Full)', value: 'o1' },
      { label: 'o1-mini', value: 'o1-mini' },
      { label: 'o1-preview', value: 'o1-preview' },
      { label: 'GPT-4o', value: 'gpt-4o' },
      { label: 'GPT-4o (Latest)', value: 'gpt-4o-latest' },
      { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
      { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
      { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' }
    ],
    anthropic: [
      { label: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20250219' },
      { label: 'Claude 3.7 Sonnet (Thinking)', value: 'claude-3-7-sonnet-20250219' }, // Note: Thinking is a param, but listed for clarity
      { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
      { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
      { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
      { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229' },
      { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' }
    ],
    deepseek: [
      { label: 'DeepSeek-V3', value: 'deepseek-chat' },
      { label: 'DeepSeek-R1', value: 'deepseek-reasoner' }
    ],
    groq: [
      { label: 'DeepSeek R1 Distill Llama 70B', value: 'deepseek-r1-distill-llama-70b' },
      { label: 'Llama 3.3 70B', value: 'llama-3.3-70b-versatile' },
      { label: 'Llama 3.1 8B', value: 'llama-3.1-8b-instant' },
      { label: 'Llama 3.1 70B', value: 'llama-3.1-70b-versatile' },
      { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' },
      { label: 'Gemma 2 9B', value: 'gemma2-9b-it' }
    ]
  };

  currentModelOptions = computed(() => this.modelOptions[this.selectedProvider()]);

  // Pipeline Execution States (Phase 1: 7-node pipeline)
  nodeStates = signal<Record<string, string>>({
    input: '', multi_review: '', arbitrate: '', critique: '', human_review: '', refine: '', output: ''
  });

  // Analysis Configuration
  opts = {
    security: true, performance: true, style: true, selfCritique: true
  };

  refinementCount = signal(0);
  startTime = Date.now();

  // --- COMPUTED VALUES ---

  renderedReport = computed<SafeHtml>(() => {
    const md = this.buildMarkdownReport();
    if (!md) return '';
    const html = marked.parse(md) as string;
    const cleanHtml = DOMPurify.sanitize(html);
    return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
  });

  filePaths = computed(() => this.parsedFiles().map(f => f.path));

  parsedFiles = computed<DiffFile[]>(() => {
    const raw = this.diffInput();
    if (!raw) return [];

    const files: DiffFile[] = [];
    let currentFile: DiffFile | null = null;
    let currentHunk: DiffHunk | null = null;

    const lines = raw.split('\n');
    let leftLine = 0;
    let rightLine = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        // match exactly " b/" preceded by a space to avoid matching 'b/' inside folder names like 'arch-tab/'
        const pathMatch = line.match(/ b\/(.+)$/);
        currentFile = {
          path: pathMatch ? pathMatch[1] : 'unknown',
          additions: 0, deletions: 0, hunks: [], isOpen: false
        };
        files.push(currentFile);
        currentHunk = null;
      } else if (line.startsWith('@@') && currentFile) {
        const rangeMatch = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (rangeMatch) {
          leftLine = parseInt(rangeMatch[1]);
          rightLine = parseInt(rangeMatch[2]);
        }
        currentHunk = { header: line, lines: [] };
        currentFile.hunks.push(currentHunk);
      } else if (currentHunk && currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ content: line, type: 'added', rightLine: rightLine++ });
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ content: line, type: 'removed', leftLine: leftLine++ });
          currentFile.deletions++;
        } else if (!line.startsWith('---') && !line.startsWith('+++')) {
          currentHunk.lines.push({ content: line, type: 'neutral', leftLine: leftLine++, rightLine: rightLine++ });
        }
      }
    }
    // Auto-expand all files by default as requested
    for (let i = 0; i < files.length; i++) {
      files[i].isOpen = true;
    }
    return files;
  });

  totalStats = computed(() => {
    const files = this.parsedFiles();
    return {
      files: files.length,
      additions: files.reduce((acc, f) => acc + f.additions, 0),
      deletions: files.reduce((acc, f) => acc + f.deletions, 0)
    };
  });

  ngOnInit() {
    this.appendLog('info', 'GitMind agent initialized. Awaiting input...');
    this.loadSettings();
    this.loadHistory();
  }

  // --- DATA PERSISTENCE ---

  loadSettings() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedProvider = localStorage.getItem('gitmind_provider');
      const savedModel = localStorage.getItem('gitmind_model');
      const savedApiKey = localStorage.getItem('gitmind_apikey');
      const savedGithubToken = localStorage.getItem('gitmind_github_token');

      if (savedProvider) this.selectedProvider.set(savedProvider);
      if (savedModel) this.selectedModel.set(savedModel);
      if (savedApiKey) this.userApiKey.set(savedApiKey);
      if (savedGithubToken) this.githubToken.set(savedGithubToken);
    }
  }

  saveSettings() {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('gitmind_provider', this.selectedProvider());
      localStorage.setItem('gitmind_model', this.selectedModel());
      localStorage.setItem('gitmind_apikey', this.userApiKey());
      localStorage.setItem('gitmind_github_token', this.githubToken());
      this.appendLog('success', '✓ Agent settings and PAT saved.');
    }
  }

  // --- HISTORY ---

  loadHistory() {
    this.apiService.getHistory().subscribe({
      next: (data) => {
        const history = data || [];
        this.analysisHistory.set(history);

        if (history.length > 0 && !this.diffInput()) {
          this.currentTab.set('history');
        }

        // Calculate Phase 4.3 Dashboard Metrics
        if (history.length > 0) {
          const totalReviews = history.length;
          const sumSec = history.reduce((acc, r) => acc + (r.security_count || 0), 0);
          const sumPerf = history.reduce((acc, r) => acc + (r.performance_count || 0), 0);
          const sumStyle = history.reduce((acc, r) => acc + (r.style_count || 0), 0);
          const totalThreats = sumSec + sumPerf + sumStyle;
          const highSev = history.reduce((acc, r) => acc + (r.high_severity_count || 0), 0);
          const avgConf = Math.round(history.reduce((acc, r) => acc + (r.confidence_score || 0), 0) / totalReviews);

          this.dashboardMetrics.set({
            totalReviews,
            totalThreats,
            highSev,
            avgConf,
            sumSec,
            sumPerf,
            sumStyle,
            secPct: totalThreats > 0 ? (sumSec / totalThreats) * 100 : 0,
            perfPct: totalThreats > 0 ? (sumPerf / totalThreats) * 100 : 0,
            stylePct: totalThreats > 0 ? (sumStyle / totalThreats) * 100 : 0,
            trend: history.slice(0, 10).map(r => ({
              date: new Date(r.created_at).toLocaleDateString(),
              score: r.confidence_score || 0,
              count: (r.security_count || 0) + (r.performance_count || 0) + (r.style_count || 0)
            })).reverse()
          });
        }
      },
      error: () => { } // Silently fail — history is non-critical
    });
  }

  loadPastAnalysis(item: any) {
    if (item.github_url) {
      this.prUrl.set(item.github_url);
    }
    this.apiService.getAnalysis(item.id).subscribe({
      next: (data) => {
        if (data?.review_data) {
          this.analysisData.set(data.review_data);
          this.autoFixes.set(data.review_data.auto_fixes || null);
          this.generatedTests.set(data.review_data.generated_tests || null);
          this.archReview.set(data.review_data.arch_review || null);
          this.currentTab.set('security');
          this.appendLog('info', `📂 Loaded past analysis from ${new Date(data.created_at).toLocaleDateString()}`);
        }
      },
      error: (err) => this.appendLog('error', 'Failed to load past analysis.')
    });
  }

  // --- EVENT HANDLERS ---

  onProviderChange() {
    const options = this.modelOptions[this.selectedProvider()];
    if (options && options.length > 0) {
      this.selectedModel.set(options[0].value);
    }
    this.saveSettings();
  }

  onModelChange() {
    this.saveSettings();
  }

  loadExample() {
    // Reset state before loading so tabs reflect a fresh start
    this.resetForNewPR();
    this.diffInput.set(EXAMPLE_DIFF);
    this.prUrl.set('https://github.com/example/webapp/pull/142');
    this.currentTab.set('diff');
    this.appendLog('info', 'Example PR diff loaded: webapp/pull/142');
  }



  setNode(id: string, state: string) {
    this.nodeStates.update(prev => ({ ...prev, [id]: state }));
  }

  async startAnalysis() {
    const diff = this.diffInput().trim();
    const url = this.prUrl().trim();

    if (!diff && !url) {
      this.appendLog('error', 'Please provide a PR URL or paste a diff first.');
      return;
    }

    this.saveSettings();
    this.isAnalyzing.set(true);
    this.isAwaitingFeedback.set(false);
    this.analysisData.set(null);
    this.autoFixes.set(null);
    this.generatedTests.set(null);
    this.archReview.set(null);
    this.refinementCount.set(0);
    this.threadId.set(null);
    this.startTime = Date.now();

    ['input', 'multi_review', 'arbitrate', 'critique', 'human_review', 'refine', 'output'].forEach(n => this.setNode(n, ''));
    this.setNode('input', 'active');

    this.appendLog('info', `▶ Starting analysis using ${this.selectedModel().toUpperCase()}...`);

    this.apiService.analyze({
      diff: diff || null,
      github_url: url || null,
      github_token: this.githubToken() || null,
      security_scan: this.opts.security,
      perf_analysis: this.opts.performance,
      style_review: this.opts.style,
      self_critique: this.opts.selfCritique,
      selected_provider: this.selectedProvider(),
      selected_model: this.selectedModel(),
      api_key: this.userApiKey() || null
    }).subscribe({
      next: (chunk) => this.processStreamChunk(chunk),
      error: (err) => {
        this.appendLog('error', `✗ Connection error: ${err.message || 'Unknown error'}`);
        this.isAnalyzing.set(false);
      },
      complete: () => {
        if (!this.isAwaitingFeedback()) {
          this.isAnalyzing.set(false);
        }
      }
    });
  }

  processStreamChunk(chunk: string) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          this.handleAgentEvent(data);
        } catch (e) {
          console.error('Failed to parse SSE line', line);
        }
      }
    }
  }

  handleAgentEvent(data: any) {
    const { node, status, reviews, critique, auto_fixes, generated_tests, arch_review, refinement_count, monologue, message, thread_id } = data;

    if (thread_id) {
      this.threadId.set(thread_id);
      return;
    }

    if (node === 'error' || status === 'failed') {
      const displayMsg = this.getUserFriendlyErrorMessage(message || 'Process failed');
      this.errorMessage.set(displayMsg);
      this.appendLog('error', `✗ Error: ${displayMsg}`);
      this.isAnalyzing.set(false);
      return;
    }

    if (monologue && monologue.length > 0) {
      monologue.forEach((msg: string) => this.appendLog('accent', msg));
    }

    if (status === 'awaiting_feedback' || node === 'human_review') {
      this.isAwaitingFeedback.set(true);
      this.isAnalyzing.set(false);
      this.setNode('critique', 'done');
      this.setNode('human_review', 'active');
      this.appendLog('warn', '✋ Waiting for human feedback. Scroll to refinement UI below.');
    }

    if (node === 'input') this.setNode('input', 'active');
    else if (node === 'multi_review') { this.setNode('input', 'done'); this.setNode('multi_review', 'active'); }
    else if (node === 'arbitrate') { this.setNode('multi_review', 'done'); this.setNode('arbitrate', 'active'); }
    else if (node === 'critique') {
      this.setNode('arbitrate', 'done');
      this.setNode('critique', 'active');
      if (critique) this.critiqueData.set(critique);
    }
    else if (node === 'enhance') {
      this.setNode('arbitrate', 'done');
      if (auto_fixes) this.autoFixes.set(auto_fixes);
      if (generated_tests) this.generatedTests.set(generated_tests);
      if (arch_review) this.archReview.set(arch_review);
    }
    else if (node === 'refine') {
      this.setNode('human_review', 'done');
      this.setNode('refine', 'loop');
      this.refinementCount.set(refinement_count);
    }

    if (reviews) {
      this.analysisData.set(reviews);
      this.setNode('output', 'done');
      this.setNode('refine', reviews.confidence_score > 80 ? 'done' : '');
      this.setNode('critique', 'done');
      this.setNode('human_review', 'done');
      this.appendLog('success', '✓ Analysis complete. Report generated.');
      this.successMessage.set('The code review analysis has completed successfully. Your report is ready!');
      this.isAwaitingFeedback.set(false);
      this.isAnalyzing.set(false);
      this.loadHistory(); // Refresh history list
    }
  }

  getUserFriendlyErrorMessage(rawMessage: string): string {
    const msg = rawMessage.toLowerCase();

    // Check for exhaustive limits / rate limits
    if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('rate_limit')) {
      return "Quota Exhausted: Your API provider's resource limits or billing constraints have been hit. Please check your account dashboard or try switching to a different LLM model.";
    }

    // Check for auth / invalid key
    if (msg.includes('401') || msg.includes('400') && msg.includes('api key') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('incorrect api key') || msg.includes('api_key_invalid')) {
      return "Invalid API Key: The LLM API key provided is missing, invalid, or incorrect. Please check the Agent Controls panel and ensure you have entered a valid key for the selected model.";
    }

    // Check for permissions
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission denied')) {
      return "Permission Denied: Ensure you have the required access rights for this model, and your GitHub PAT has the correct read scopes for the linked repository.";
    }

    // Check for model not found / deprecated
    if (msg.includes('404') || msg.includes('not_found') || msg.includes('not found') || msg.includes('is not supported')) {
      return "Model Not Found: The selected model is unavailable or has been deprecated by the provider. Please switch to a different model in the Agent Controls panel (e.g., Gemini 2.5 Flash or GPT-4o).";
    }

    // Check for model context capacity exceeded
    if (msg.includes('context') || msg.includes('too many tokens') || msg.includes('maximum context length')) {
      return "Context Limit Exceeded: This Pull Request is too large for the selected model. Try using a model with a larger context window (like Gemini 2.5 Pro or Claude 3.5).";
    }

    return "An unexpected error occurred during processing: " + rawMessage;
  }

  submitFeedback() {
    const feedback = this.userFeedback().trim();
    const threadId = this.threadId();

    if (!threadId) return;

    this.isAnalyzing.set(true);
    this.isAwaitingFeedback.set(false);
    this.appendLog('info', `▶ Resuming analysis with human feedback...`);

    this.apiService.provideFeedback(threadId, feedback).subscribe({
      next: (chunk) => this.processStreamChunk(chunk),
      error: (err) => {
        this.appendLog('error', `✗ Feedback error: ${err.message || 'Unknown error'}`);
        this.isAnalyzing.set(false);
      },
      complete: () => {
        if (!this.isAwaitingFeedback()) {
          this.isAnalyzing.set(false);
        }
      }
    });

    this.userFeedback.set(''); // Clear input
  }



  switchTab(name: string) {
    // Phase: Deferred tab switching — show loader, yield to browser, then update
    if (this.currentTab() === name) return;
    this.tabLoading.set(true);
    this.currentTab.set('__loading__'); // Clear current tab to unmount heavy DOM

    // Use requestAnimationFrame to let the browser paint the skeleton first
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.currentTab.set(name);
        this.tabLoading.set(false);
      }, 40); // Small delay gives browser time to GC the old tab DOM
    });
  }

  // trackBy functions to prevent DOM thrashing
  trackByPath(index: number, file: DiffFile): string {
    return file.path;
  }
  trackByIndex(index: number): number {
    return index;
  }
  trackByIssue(index: number, item: ReviewItem): string {
    return (item.file_path || '') + ':' + (item.line_number || index) + ':' + item.issue.slice(0, 30);
  }


  /**
   * Resets all PR-specific analysis state when a new PR is loaded.
   * This ensures the tabs rail only shows History → Diff → Review progressively.
   */
  resetForNewPR() {
    this.diffInput.set('');
    this.analysisData.set(null);
    this.critiqueData.set(null);
    this.autoFixes.set(null);
    this.generatedTests.set(null);
    this.archReview.set(null);
    this.selectedFilePath.set(null);
    this.isAnalyzing.set(false);
    this.isAwaitingFeedback.set(false);
    this.threadId.set(null);
    this.refinementCount.set(0);
    this.nodeStates.set({ input: '', multi_review: '', arbitrate: '', critique: '', human_review: '', refine: '', output: '' });
    // Route back to history if exists, otherwise clear tab
    this.currentTab.set(this.analysisHistory().length ? 'history' : 'diff');
  }

  fetchPrDiff() {
    const url = this.prUrl().trim();
    if (!url) {
      this.appendLog('error', 'Please provide a valid GitHub PR or Commit URL.');
      return;
    }

    // Reset all previous analysis state so tabs reset cleanly
    this.resetForNewPR();
    this.appendLog('info', `▶ Fetching diff from GitHub...`);

    this.apiService.fetchDiff(url).subscribe({
      next: (res) => {
        this.diffInput.set(res.diff);
        this.currentTab.set('diff');
        this.appendLog('success', '✓ Diff fetched and loaded into viewer.');
      },
      error: (err: any) => {
        this.appendLog('error', `✗ Failed to fetch diff: ${err.error?.detail || err.message}`);
      }
    });
  }

  buildMarkdownReport() {
    const data = this.analysisData();
    if (!data) return '';

    const ts = new Date().toISOString().split('T')[0];
    let md = `# GitMind Code Review Report\n\n`;
    md += `**Generated:** ${ts}  \n`;
    md += `**Status:** ${data.approval_status?.toUpperCase() || 'UNKNOWN'}  \n`;
    md += `**Confidence:** ${data.confidence_score || 0}%\n\n`;

    md += `## Executive Summary\n\n${data.summary || 'No summary provided.'}\n\n`;

    ['security', 'performance', 'style'].forEach(cat => {
      const items = (data as any)[cat];
      if (items && items.length > 0) {
        md += `## ${cat === 'security' ? '🔐 Security' : cat === 'performance' ? '⚡ Performance' : '🎨 Style'}\n\n`;
        items.forEach((i: any) => {
          md += `### [${i.severity.toUpperCase()}] ${i.issue}\n`;
          if (i.line) md += `**Code:** \`${i.line}\`  \n`;
          md += `**Fix:** ${i.fix}\n\n`;
        });
      }
    });

    md += `---\n*Report generated by GitMind — LangGraph Self-Correcting Code Review Agent*`;
    return md;
  }

  copyReport() {
    navigator.clipboard.writeText(this.buildMarkdownReport());
    this.appendLog('success', '✓ Report copied to clipboard');
  }

  pushToGithub(item: ReviewItem) {
    const url = this.prUrl().trim();
    const token = this.githubToken().trim();

    if (!url) {
      this.appendLog('error', 'PR URL is required to push comments.');
      return;
    }

    if (!token) {
      this.appendLog('error', 'GitHub PAT is missing. Please enter it in the "Agent Controls" panel on the left and ensure it is saved.');
      return;
    }

    this.appendLog('info', `▶ Pushing suggestion to GitHub for: ${item.issue}...`);

    this.apiService.pushComment(url, item, token).subscribe({
      next: (res) => {
        this.appendLog('success', `✓ Suggestion posted successfully! View here: ${res.comment_url}`);
      },
      error: (err) => {
        this.appendLog('error', `✗ Failed to post suggestion: ${err.error?.detail || err.message}`);
      }
    });
  }



  scrollToFile(path: string) {
    this.selectedFilePath.set(path);
    if (this.currentTab() !== 'diff') {
        this.switchTab('diff');
    }

    // Give Angular time to render if tab was switched
    setTimeout(() => {
      const element = document.getElementById(`file-${path}`);
      if (element) {
         // Changed behavior from 'smooth' to 'auto' or 'instant' to fix 'longer time to navigate'
        element.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 100);
  }



  // --- PHASE 3: APPLY FIX ---
  applyingFixFor = signal<string | null>(null);

  triggerCardAutoFix(item: ReviewItem) {
    if (!item.file_path) {
      this.errorMessage.set("Cannot apply fix: No file path associated with this review item.");
      return;
    }
    const fixPayload = {
      file_path: item.file_path,
      fixed_code: item.fix,
      description: `Auto-Fix for: ${item.issue}`,
      is_safe: item.severity !== 'high' // Require warning for high severity
    };
    this.applyFix(fixPayload);
  }

  dismissIssue(item: ReviewItem, category: 'security' | 'performance' | 'style') {
    const githubUrl = this.prUrl();
    if (!githubUrl || !item.issue) return;
    
    // Optimistically remove from UI
    const currentData = this.analysisData();
    if (currentData && currentData[category]) {
      const updatedList = currentData[category].filter(i => i.issue !== item.issue);
      this.analysisData.set({
        ...currentData,
        [category]: updatedList
      });
      this.successMessage.set("Issue dismissed and hidden for future runs on this repo.");
    }
    
    // Send to backend to persist
    this.apiService.suppressIssue(githubUrl, item.issue).subscribe({
      error: () => this.errorMessage.set("Failed to save suppression to backend.")
    });
  }

  stageFix(item: ReviewItem) {
    const filePath = item.file_path;
    const issueText = item.issue;
    if (!filePath || !issueText) {
      this.errorMessage.set("Cannot stage fix: missing file path or issue text.");
      return;
    }
    // Deduplicate — replace if already staged for same file+issue
    this.stagedFixes.update(current => [
      ...current.filter(f => !(f.file_path === filePath && f.issue === issueText)),
      { file_path: filePath, fixed_code: item.fix, issue: issueText, item }
    ]);
  }

  unstageFix(item: ReviewItem) {
    const filePath = item.file_path;
    const issueText = item.issue;
    if (!filePath || !issueText) return;

    this.stagedFixes.update(current =>
      current.filter(f => !(f.file_path === filePath && f.issue === issueText))
    );
  }

  isStagedFix(item: ReviewItem): boolean {
    return this.stagedFixes().some(f => f.file_path === item.file_path && f.issue === item.issue);
  }

  pushStagedFixes() {
    const githubUrl = this.prUrl();
    const token = this.githubToken();
    const fixes = this.stagedFixes();

    if (!githubUrl || !token) {
      this.errorMessage.set("GitHub URL and Token are required to push fixes.");
      return;
    }
    if (fixes.length === 0) return;

    this.isPushingFixes.set(true);
    const payload = fixes.map(f => ({ file_path: f.file_path, fixed_code: f.fixed_code, issue: f.issue }));

    this.apiService.batchApplyFixes(githubUrl, token, payload).subscribe({
      next: (res) => {
        this.successMessage.set(`✅ Pushed ${fixes.length} fix(es) as one commit!`);
        this.stagedFixes.set([]);      // clear the cart
        this.isPushingFixes.set(false);
        if (res.commit_url) window.open(res.commit_url, '_blank');
      },
      error: (err) => {
        this.errorMessage.set(`Failed to push fixes: ${err.error?.detail || err.message}`);
        this.isPushingFixes.set(false);
      }
    });
  }

  applyFix(fix: any) {
    const githubUrl = this.prUrl();
    const token = this.githubToken();
    if (!githubUrl || !token) {
      this.errorMessage.set("GitHub URL and Token are required to apply fixes.");
      return;
    }

    if (!fix.is_safe && !confirm("Warning: This is a high-severity fix. Are you sure you want to apply it automatically?")) {
      return;
    }

    this.applyingFixFor.set(fix.file_path);
    this.apiService.applyFix(githubUrl, fix.file_path, fix.fixed_code, token, fix.description).subscribe({
      next: (res) => {
        this.successMessage.set(`Successfully applied patch to ${fix.file_path}!`);
        this.applyingFixFor.set(null);
        if (res.commit_url) {
          window.open(res.commit_url, "_blank");
        }
      },
      error: (err) => {
        this.errorMessage.set(`Failed to apply fix: ${err.error?.detail || err.message || err.statusText}`);
        this.applyingFixFor.set(null);
      }
    });
  }
}

// Example data for demonstration
const EXAMPLE_DIFF = `diff --git a/src/auth/userController.js b/src/auth/userController.js
index 1234567..890abcde 100644
--- a/src/auth/userController.js
+++ b/src/auth/userController.js
@@ -8,12 +19,19 @@ const db = require('../db');
 
+const SECRET = "hardcoded_jwt_secret_12345";
+
 async function getUserById(req, res) {
-  const { id } = req.params;
-  const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+  const id = req.params.id;
+  const user = await db.query(\`SELECT * FROM users WHERE id = \${id}\`);
   if (!user) return res.status(404).json({ error: 'Not found' });
   res.json(user);
 }
 
+async function getAllUsers(req, res) {
+  const users = await db.query('SELECT * FROM users');
+  console.log(users); // debug
+  res.json(users);
+}
+diff --git a/src/utils/cache.js b/src/utils/cache.js
--- a/src/utils/cache.js
+++ b/src/utils/cache.js
@@ -3,7 +3,18 @@ const redis = require('redis');
 
 function getCache(key) {
-  return redis.get(key);
+  var result = null;
+  for (var i = 0; i < 1000; i++) {
+    result = redis.get(key);
+  }
return result;
}
`;
