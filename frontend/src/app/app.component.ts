import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
})
export class App {
  // Signals for state management
  prUrl = signal('');
  diffInput = signal('');
  isAnalyzing = signal(false);
  currentTab = signal('summary');
  logs = signal<LogEntry[]>([]);
  analysisData = signal<ReviewReport | null>(null);
  
  // Pipeline Node States
  nodeStates = signal<Record<string, string>>({
    input: '',
    review: '',
    critique: '',
    refine: '',
    output: ''
  });

  // Options
  opts = {
    security: true,
    performance: true,
    style: true,
    selfCritique: true
  };

  refinementCount = signal(0);
  startTime = Date.now();

  constructor(private http: HttpClient) {
    this.appendLog('info', 'GitMind agent initialized. Awaiting input...');
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
    
    // Auto-scroll log box (handled in template or via ViewChild)
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

    this.isAnalyzing.set(true);
    this.analysisData.set(null);
    this.refinementCount.set(0);
    this.startTime = Date.now();
    
    // Reset nodes
    this.setNode('input', '');
    this.setNode('review', '');
    this.setNode('critique', '');
    this.setNode('refine', '');
    this.setNode('output', '');

    this.setNode('input', 'active');
    this.appendLog('info', '▶ Starting analysis via FastAPI + LangGraph...');

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
          self_critique: this.opts.selfCritique
        })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

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

  handleAgentEvent(data: any) {
    const { node, status, reviews, critique, refinement_count, message } = data;

    if (node === 'error') {
      this.appendLog('error', `✗ Backend error: ${message}`);
      this.isAnalyzing.set(false);
      return;
    }

    if (node === 'input') {
      this.setNode('input', 'active');
      this.appendLog('info', '▶ Input node active: fetching/parsing diff...');
    } else if (node === 'review') {
      this.setNode('input', 'done');
      this.setNode('review', 'active');
      this.appendLog('info', '▶ Review node active: running analysis...');
    } else if (node === 'critique') {
      this.setNode('review', 'done');
      this.setNode('critique', 'active');
      this.appendLog('info', '▶ Self-critique node active: evaluating quality...');
    } else if (node === 'refine') {
      this.setNode('critique', 'done');
      this.setNode('refine', 'loop');
      this.refinementCount.set(refinement_count);
      this.appendLog('warn', `⚠ Critique insufficient. Triggering refinement loop (Count: ${refinement_count})...`);
    }

    if (reviews) {
      this.analysisData.set(reviews);
      this.setNode('output', 'done');
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
    return statusMap[data.approval_status] || statusMap['needs_changes'];
  }

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
          this.appendLog('success', '✓ Diff fetched and loaded into editor.');
        },
        error: (err) => {
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
    
    if (data.security && data.security.length > 0) {
      md += `## 🔐 Security\n\n`;
      data.security.forEach(i => {
        md += `### [${i.severity.toUpperCase()}] ${i.issue}\n`;
        if (i.line) md += `**Code:** \`${i.line}\`  \n`;
        md += `**Fix:** ${i.fix}\n\n`;
      });
    }
    
    if (data.performance && data.performance.length > 0) {
      md += `## ⚡ Performance\n\n`;
      data.performance.forEach(i => {
        md += `### [${i.severity.toUpperCase()}] ${i.issue}\n`;
        if (i.line) md += `**Code:** \`${i.line}\`  \n`;
        md += `**Fix:** ${i.fix}\n\n`;
      });
    }
    
    if (data.style && data.style.length > 0) {
      md += `## 🎨 Style\n\n`;
      data.style.forEach(i => {
        md += `### [${i.severity.toUpperCase()}] ${i.issue}\n`;
        if (i.line) md += `**Code:** \`${i.line}\`  \n`;
        md += `**Fix:** ${i.fix}\n\n`;
      });
    }
    
    md += `---\n*Report generated by GitMind — LangGraph Self-Correcting Code Review Agent*`;
    return md;
  }

  copyReport() {
    navigator.clipboard.writeText(this.buildMarkdownReport());
    this.appendLog('success', '✓ Report copied to clipboard');
  }
}

const EXAMPLE_DIFF = `--- a/src/auth/userController.js
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
+`;
