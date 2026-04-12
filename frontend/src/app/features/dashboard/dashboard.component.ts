import { Component, signal, computed, inject, OnInit, AfterViewChecked } from '@angular/core';
import mermaid from 'mermaid';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { ApiService, LogEntry } from '../../core/api.service';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { ActivityLogComponent } from '../../shared/components/activity-log/activity-log.component';
import { FileTreeComponent } from '../../shared/components/file-tree/file-tree.component';
import { AnalyticsDashboardComponent } from '../analytics/analytics.component';
import { ReviewPanelComponent } from '../../shared/components/review-panel/review-panel.component';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';
import { SummaryTabComponent } from '../summary-tab/summary-tab.component';
import { PipelineVisualizerComponent } from '../pipeline-visualizer/pipeline-visualizer.component';
import { ThinkingLogsComponent } from '../thinking-logs/thinking-logs.component';
import { AutofixPanelComponent } from '../autofix-panel/autofix-panel.component';
import { TestsPanelComponent } from '../tests-panel/tests-panel.component';
import { AgentControlsComponent } from '../agent-controls/agent-controls.component';
import { OverlaysComponent } from '../overlays/overlays.component';
import { AnalysisHistoryComponent } from '../analysis-history/analysis-history.component';
import { HumanFeedbackComponent } from '../human-feedback/human-feedback.component';
import { ArchTabComponent } from '../arch-tab/arch-tab.component';
import { RawReportTabComponent } from '../raw-report-tab/raw-report-tab.component';

import { SidebarLayoutComponent } from '../sidebar-layout/sidebar-layout.component';
import { ReportHeaderComponent } from '../report-header/report-header.component';
import { TabsBarComponent } from '../tabs-bar/tabs-bar.component';
import { DraggableDirective } from '../../shared/directives/draggable.directive';

import { GitMindStateService } from '../../core/state.service';
import { AuthService } from '../../core/auth/auth.service';

import {
  ReviewItem,
  ReviewReport,
  DiffLine,
  DiffHunk,
  DiffFile,
  DashboardMetrics
} from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, ActivityLogComponent, AnalyticsDashboardComponent, ReviewPanelComponent, DiffViewerComponent, SummaryTabComponent, PipelineVisualizerComponent, ThinkingLogsComponent, AutofixPanelComponent, TestsPanelComponent, AgentControlsComponent, OverlaysComponent, AnalysisHistoryComponent, HumanFeedbackComponent, ArchTabComponent, RawReportTabComponent, SidebarLayoutComponent, ReportHeaderComponent, TabsBarComponent, DraggableDirective],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {

  private sanitizer = inject(DomSanitizer);
  private apiService = inject(ApiService);
  private authService = inject(AuthService);

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
  tokensSaved = this.state.tokensSaved;

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
  stagedFilesSummary = computed(() => {
    const fixes = this.stagedFixes();
    if (fixes.length === 0) return '';
    const names = fixes.slice(0, 2).map(f => f.file_path.split('/').pop() || '');
    let summary = '— ' + names.join(', ');
    if (fixes.length > 2) summary += '…';
    return summary;
  });

  appendLog(type: LogEntry['type'], msg: string) {
    this.state.appendLog(type, msg);
  }

  clearError() {
    this.state.clearError();
  }

  clearSuccess() {
    this.state.clearSuccess();
  }

  onTokenInputChange(val: string) {
    this.githubTokenInput = val;
    this.githubToken.set(val);
    this.saveSettings();
    if (val) {
      this.appendLog('success', '✓ GitHub PAT updated and saved locally.');
    }
  }
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

  currentModelOptions = computed(() => this.modelOptions[this.selectedProvider()] || []);

  nodeStates = signal<Record<string, string>>({
    input: '', multi_review: '', arbitrate: '', critique: '', human_review: '', refine: '', output: ''
  });

  opts = {
    security: true, performance: true, style: true, selfCritique: true
  };

  refinementCount = signal(0);
  startTime = Date.now();

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
    for (const f of files) f.isOpen = true;
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
    this.loadSettings();
    this.loadHistory();
  }

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

  loadHistory() {
    this.apiService.getHistory().subscribe({
      next: (data) => {
        const history = data || [];
        this.analysisHistory.set(history);
        if (history.length > 0 && !this.diffInput()) {
          this.currentTab.set('history');
        }
        if (history.length > 0) {
          const totalReviews = history.length;
          const sumSec = history.reduce((acc, r) => acc + (r.security_count || 0), 0);
          const sumPerf = history.reduce((acc, r) => acc + (r.performance_count || 0), 0);
          const sumStyle = history.reduce((acc, r) => acc + (r.style_count || 0), 0);
          const totalThreats = sumSec + sumPerf + sumStyle;
          const highSev = history.reduce((acc, r) => acc + (r.high_severity_count || 0), 0);
          const avgConf = Math.round(history.reduce((acc, r) => acc + (r.confidence_score || 0), 0) / totalReviews);

          this.dashboardMetrics.set({
            totalReviews, totalThreats, highSev, avgConf, sumSec, sumPerf, sumStyle,
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
      }
    });
  }

  loadPastAnalysis(item: any) {
    if (item.github_url) this.prUrl.set(item.github_url);
    this.apiService.getAnalysis(item.id).subscribe({
      next: (data) => {
        if (data?.diff_text && data.diff_text.trim().startsWith('diff --git')) {
          this.diffInput.set(data.diff_text);
        } else {
          this.diffInput.set('');
        }
        if (data?.review_data) {
          this.analysisData.set(data.review_data);
          this.autoFixes.set(data.review_data.auto_fixes || null);
          this.generatedTests.set(data.review_data.generated_tests || null);
          this.archReview.set(data.review_data.arch_review || null);
          this.currentTab.set('summary');
        }
      }
    });
  }

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
    this.resetForNewPR();
    this.diffInput.set(EXAMPLE_DIFF);
    this.prUrl.set('https://github.com/example/webapp/pull/142');
    this.currentTab.set('diff');
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
    const hasSessionToken = !!localStorage.getItem("gitmind_token");
    this.appendLog('info', `Initializing analysis pipeline... (Session: ${hasSessionToken ? 'Authorized' : 'Anonymous'})`);
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
    const { node, status, reviews, critique, auto_fixes, generated_tests, arch_review, refinement_count, tokens_saved, monologue, message, thread_id } = data;

    if (thread_id) {
      this.threadId.set(thread_id);
      return;
    }

    if (tokens_saved !== undefined && tokens_saved > 0) {
      this.tokensSaved.set(tokens_saved);
    }

    if (node === 'error' || status === 'failed') {
      this.errorMessage.set(message || 'Process failed');
      this.isAnalyzing.set(false);
      return;
    }

    if (status === 'analysis_saved') {
      this.appendLog('accent', '📊 Analysis history updated.');
      this.loadHistory();
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
      
      // Auto-extract enhancements from the final review object if present
      if (reviews.auto_fixes) this.autoFixes.set(reviews.auto_fixes);
      if (reviews.generated_tests) this.generatedTests.set(reviews.generated_tests);
      if (reviews.arch_review) this.archReview.set(reviews.arch_review);

      this.setNode('output', 'done');
      this.setNode('refine', reviews.confidence_score > 80 ? 'done' : '');
      this.setNode('critique', 'done');
      this.setNode('human_review', 'done');
      this.successMessage.set('The code review analysis has completed successfully.');
      this.isAwaitingFeedback.set(false);
      this.isAnalyzing.set(false);
      
      // Fallback: If 'analysis_saved' SSE is missed, update history after 3s
      setTimeout(() => {
        this.loadHistory();
      }, 3000);
    }
  }

  submitFeedback() {
    const feedback = this.userFeedback().trim();
    const threadId = this.threadId();
    if (!threadId) return;

    this.isAnalyzing.set(true);
    this.isAwaitingFeedback.set(false);

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

    this.userFeedback.set('');
  }

  switchTab(name: string) {
    if (this.currentTab() === name) return;
    this.tabLoading.set(true);
    this.currentTab.set('__loading__');
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.currentTab.set(name);
        this.tabLoading.set(false);
      }, 40);
    });
  }

  trackByPath(index: number, file: DiffFile): string { return file.path; }
  trackByIndex(index: number): number { return index; }
  trackByIssue(index: number, item: ReviewItem): string { return (item.file_path || '') + ':' + (item.line_number || index); }

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
    this.tokensSaved.set(0);
    this.nodeStates.set({ input: '', multi_review: '', arbitrate: '', critique: '', human_review: '', refine: '', output: '' });
    this.currentTab.set(this.analysisHistory().length ? 'history' : 'diff');
  }

  fetchPrDiff() {
    const url = this.prUrl().trim();
    if (!url) return;
    this.resetForNewPR();
    this.apiService.fetchDiff(url).subscribe({
      next: (res) => {
        this.diffInput.set(res.diff);
        this.currentTab.set('diff');
      }
    });
  }

  buildMarkdownReport() {
    const data = this.analysisData();
    if (!data) return '';
    let md = `# GitMind Code Review Report\n\n`;
    md += `**Status:** ${data.approval_status?.toUpperCase() || 'UNKNOWN'}  \n`;
    md += `**Confidence:** ${data.confidence_score || 0}%\n\n`;
    md += `## Executive Summary\n\n${data.summary || 'No summary provided.'}\n\n`;
    return md;
  }

  copyReport() {
    navigator.clipboard.writeText(this.buildMarkdownReport());
    this.appendLog('success', '✓ Report copied to clipboard');
  }

  pushToGithub(item: ReviewItem) {
    const url = this.prUrl().trim();
    const token = this.githubToken().trim();
    if (!url || !token) return;
    this.apiService.pushComment(url, item, token).subscribe({
      next: (res) => this.appendLog('success', `✓ Suggestion posted!`)
    });
  }

  scrollToFile(path: string) {
    this.selectedFilePath.set(path);
    if (this.currentTab() !== 'diff') this.switchTab('diff');
    setTimeout(() => {
      const element = document.getElementById(`file-${path}`);
      if (element) element.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 100);
  }

  applyingFixFor = signal<string | null>(null);

  isStagedFix(item: ReviewItem): boolean {
    return this.stagedFixes().some(f => f.file_path === item.file_path && f.issue === item.issue);
  }

  stageFix(item: ReviewItem) {
    this.stagedFixes.update(current => [
      ...current.filter(f => !(f.file_path === item.file_path && f.issue === item.issue)),
      { file_path: item.file_path!, fixed_code: item.fix, issue: item.issue, item }
    ]);
  }

  unstageFix(item: ReviewItem) {
    this.stagedFixes.update(current =>
      current.filter(f => !(f.file_path === item.file_path && f.issue === item.issue))
    );
  }

  isPushingFixes = signal(false); // Remove the duplicate if it exists, wait I'll just keep this one and remove line 108

  pushStagedFixes() {
    const githubUrl = this.prUrl();
    const token = this.githubToken();
    const fixes = this.stagedFixes();
    if (!githubUrl || !token || fixes.length === 0) return;

    this.isPushingFixes.set(true);
    const payload = fixes.map(f => ({ file_path: f.file_path, original_code: f.item.line || '', fixed_code: f.fixed_code, issue: f.issue }));
    this.apiService.batchApplyFixes(githubUrl, token, payload).subscribe({
      next: (res) => {
        this.successMessage.set(`✅ Pushed ${fixes.length} fix(es)!`);
        this.stagedFixes.set([]);
        this.isPushingFixes.set(false);
      },
      error: () => this.isPushingFixes.set(false)
    });
  }

  applyFix(fix: any) {
    const githubUrl = this.prUrl();
    const token = this.githubToken();
    if (!githubUrl || !token) return;
    this.applyingFixFor.set(fix.file_path);
    this.apiService.applyFix(githubUrl, fix.file_path, fix.original_code || '', fix.fixed_code, token, fix.description).subscribe({
      next: () => {
        this.successMessage.set(`Applied patch to ${fix.file_path}!`);
        this.applyingFixFor.set(null);
      },
      error: () => this.applyingFixFor.set(null)
    });
  }


  dismissIssue(item: ReviewItem, category: string) {
    this.analysisData.update(data => {
      if (!data) return data;
      const updated = { ...data };
      if (category === 'security') updated.security = updated.security.filter(i => i !== item);
      if (category === 'performance') updated.performance = updated.performance.filter(i => i !== item);
      if (category === 'style') updated.style = updated.style.filter(i => i !== item);
      return updated;
    });
    this.appendLog('info', `Dismissed issue in ${item.file_path}`);
  }
}

const EXAMPLE_DIFF = `diff --git a/src/auth/userController.js b/src/auth/userController.js
index 1234567..890abcde 100644
--- a/src/auth/userController.js
+++ b/src/auth/userController.js
@@ -8,12 +19,19 @@ const db = require('../db');

+const SECRET = "hardcoded_jwt_secret_12345";

async function getUserById(req, res) {
-  const { id } = req.params;
-  const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+  const id = req.params.id;
+  const user = await db.query(\`SELECT * FROM users WHERE id = \${id}\`);
+  if (!user) return res.status(404).json({ error: 'Not found' });
+  res.json(user);
+}
+`;
