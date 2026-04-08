/**
 * GitMind Frontend - Main Application Component
 * 
 * This component manages the state of the PR review process, handles real-time 
 * SSE updates from the backend, and provides a rich diff visualization.
 */

import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

// --- DATA MODELS ---

interface ReviewItem {
  issue: string;
  severity: 'high' | 'medium' | 'low';
  line?: string;
  fix: string;
}

interface ReviewReport {
  security: ReviewItem[];
  performance: ReviewItem[];
  style: ReviewItem[];
  summary: string;
  approval_status: 'approved' | 'needs_changes' | 'rejected';
  confidence_score: number;
}

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'accent';
  msg: string;
}

interface DiffLine {
  content: string;
  type: 'added' | 'removed' | 'neutral';
  leftLine?: number;
  rightLine?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isOpen: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
})
export class App {
  private sanitizer = inject(DomSanitizer);
  private http = inject(HttpClient);

  // --- UI & STATE SIGNALS ---
  
  prUrl = signal('');
  diffInput = signal('');
  isAnalyzing = signal(false);
  currentTab = signal('diff');
  logs = signal<LogEntry[]>([]);
  analysisData = signal<ReviewReport | null>(null);
  
  // Model Selection Signals
  selectedProvider = signal('gemini');
  selectedModel = signal('gemini-2.5-flash');
  userApiKey = signal('');

  /**
   * Model Configuration Map
   * Maps providers to their specific available models.
   */
  modelOptions: Record<string, {label: string, value: string}[]> = {
    gemini: [
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 3.0 Flash (Preview)', value: 'gemini-3-flash-preview' },
      { label: 'Gemini 3.1 Pro (Preview)', value: 'gemini-3.1-pro-preview' },
      { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' }
    ],
    openai: [
      { label: 'GPT-4o', value: 'gpt-4o' },
      { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
      { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' }
    ],
    anthropic: [
      { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620' },
      { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
      { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' }
    ],
    deepseek: [
      { label: 'DeepSeek Chat (V3)', value: 'deepseek-chat' },
      { label: 'DeepSeek Coder', value: 'deepseek-coder' }
    ],
    groq: [
      { label: 'Llama 3.3 70B', value: 'llama-3.3-70b-versatile' },
      { label: 'Llama 3.1 8B', value: 'llama-3.1-8b-instant' },
      { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' }
    ]
  };

  currentModelOptions = computed(() => this.modelOptions[this.selectedProvider()]);

  // Pipeline Execution States
  nodeStates = signal<Record<string, string>>({
    input: '', review: '', critique: '', refine: '', output: ''
  });

  // Analysis Configuration
  opts = {
    security: true, performance: true, style: true, selfCritique: true
  };

  refinementCount = signal(0);
  startTime = Date.now();

  // --- COMPUTED VALUES ---

  /**
   * Transforms raw markdown into sanitized SafeHtml for the report view.
   */
  renderedReport = computed<SafeHtml>(() => {
    const md = this.buildMarkdownReport();
    if (!md) return '';
    const html = marked.parse(md) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /**
   * Parser logic to transform raw Git diff string into a structured 
   * object model for the rich diff viewer.
   */
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
        const pathMatch = line.match(/b\/(.+)$/);
        currentFile = {
          path: pathMatch ? pathMatch[1] : 'unknown',
          additions: 0, deletions: 0, hunks: [], isOpen: true
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

  constructor() {
    this.appendLog('info', 'GitMind agent initialized. Awaiting input...');
    this.loadSettings();
  }

  // --- DATA PERSISTENCE ---

  /**
   * Recovers model preferences and API keys from localStorage.
   */
  loadSettings() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedProvider = localStorage.getItem('gitmind_provider');
      const savedModel = localStorage.getItem('gitmind_model');
      const savedApiKey = localStorage.getItem('gitmind_apikey');

      if (savedProvider) this.selectedProvider.set(savedProvider);
      if (savedModel) this.selectedModel.set(savedModel);
      if (savedApiKey) this.userApiKey.set(savedApiKey);
    }
  }

  /**
   * Persists current preferences to localStorage.
   */
  saveSettings() {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('gitmind_provider', this.selectedProvider());
      localStorage.setItem('gitmind_model', this.selectedModel());
      localStorage.setItem('gitmind_apikey', this.userApiKey());
    }
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
    this.diffInput.set(EXAMPLE_DIFF);
    this.prUrl.set('github.com/example/webapp/pull/142');
    this.appendLog('info', 'Example PR diff loaded: webapp/pull/142');
  }

  appendLog(type: LogEntry['type'], msg: string) {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const s = elapsed % 60;
    const m = Math.floor(elapsed / 60);
    const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.logs.update(prev => [...prev, { time, type, msg }]);
  }

  setNode(id: string, state: string) {
    this.nodeStates.update(prev => ({ ...prev, [id]: state }));
  }

  /**
   * Core Analysis Trigger
   * Sends PR data to backend and handles the real-time SSE stream.
   */
  async startAnalysis() {
    const diff = this.diffInput().trim();
    const url = this.prUrl().trim();
    
    if (!diff && !url) {
      this.appendLog('error', 'Please provide a PR URL or paste a diff first.');
      return;
    }

    this.saveSettings();
    this.isAnalyzing.set(true);
    this.analysisData.set(null);
    this.refinementCount.set(0);
    this.startTime = Date.now();
    
    // Reset pipeline UI
    ['input', 'review', 'critique', 'refine', 'output'].forEach(n => this.setNode(n, ''));
    this.setNode('input', 'active');

    this.appendLog('info', `▶ Starting analysis using ${this.selectedModel().toUpperCase()}...`);

    try {
      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diff: diff || null,
          github_url: url || null,
          security_scan: this.opts.security,
          perf_analysis: this.opts.performance,
          style_review: this.opts.style,
          self_critique: this.opts.selfCritique,
          selected_provider: this.selectedProvider(),
          selected_model: this.selectedModel(),
          api_key: this.userApiKey() || null
        })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Stream processor loop
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            this.handleAgentEvent(data);
          }
        }
      }
    } catch (err: any) {
      this.appendLog('error', `✗ Connection error: ${err.message}`);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  /**
   * Processes individual state updates from the LangGraph backend.
   */
  handleAgentEvent(data: any) {
    const { node, status, reviews, critique, refinement_count, monologue, message } = data;

    if (node === 'error') {
      this.appendLog('error', `✗ Backend error: ${message}`);
      this.isAnalyzing.set(false);
      return;
    }

    // Process "internal monologue" thoughts from the AI
    if (monologue && monologue.length > 0) {
      monologue.forEach((msg: string) => this.appendLog('accent', msg));
    }

    // Sync node animations with backend state
    if (node === 'input') this.setNode('input', 'active');
    else if (node === 'review') { this.setNode('input', 'done'); this.setNode('review', 'active'); }
    else if (node === 'critique') { this.setNode('review', 'done'); this.setNode('critique', 'active'); }
    else if (node === 'refine') { this.setNode('critique', 'done'); this.setNode('refine', 'loop'); this.refinementCount.set(refinement_count); }

    // Final result handling
    if (reviews) {
      this.analysisData.set(reviews);
      this.setNode('output', 'done');
      this.setNode('refine', reviews.confidence_score > 80 ? 'done' : '');
      this.setNode('critique', 'done');
      this.appendLog('success', '✓ Analysis complete. Report generated.');
    }
  }

  switchTab(name: string) {
    this.currentTab.set(name);
  }

  getApprovalInfo() {
    const data = this.analysisData();
    if (!data) return null;
    
    const statusMap = {
      approved: { icon: '✅', label: 'Approved', sub: 'Ready to merge', cls: 'approved' },
      needs_changes: { icon: '⚠️', label: 'Needs Changes', sub: 'Address issues before merging', cls: 'needs_changes' },
      rejected: { icon: '❌', label: 'Rejected', sub: 'Significant issues require attention', cls: 'rejected' }
    };
    return (statusMap as any)[data.approval_status] || statusMap['needs_changes'];
  }

  /**
   * API call to fetch raw diff text via backend proxy.
   */
  fetchPrDiff() {
    const url = this.prUrl().trim();
    if (!url) {
      this.appendLog('error', 'Please provide a valid GitHub PR or Commit URL.');
      return;
    }

    this.appendLog('info', `▶ Fetching diff from GitHub...`);
    
    this.http.get<{diff: string}>('http://localhost:8000/fetch-diff', { params: { url } })
      .subscribe({
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

  /**
   * Generates a clean Markdown representation of the review results.
   */
  buildMarkdownReport() {
    const data = this.analysisData();
    if (!data) return '';
    
    const ts = new Date().toISOString().split('T')[0];
    let md = `# GitMind Code Review Report\n\n`;
    md += `**Generated:** ${ts}  \n`;
    md += `**Status:** ${data.approval_status?.toUpperCase() || 'UNKNOWN'}  \n`;
    md += `**Confidence:** ${data.confidence_score || 0}%\n\n`;
    
    md += `## Executive Summary\n\n${data.summary || 'No summary provided.'}\n\n`;
    
    // Add findings by category
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

  toggleFile(file: DiffFile) {
    file.isOpen = !file.isOpen;
  }
}

// Example data for demonstration
const EXAMPLE_DIFF = `diff --git a/src/auth/userController.js b/src/auth/userController.js
index 1234567..890abcde 100644
--- a/src/auth/userController.js
+++ b/src/auth/userController.js
@@ -8,12 +8,19 @@ const db = require('../db');
 
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
+  return result;
+}
+`;
