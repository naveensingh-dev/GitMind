import { Injectable, signal, computed } from '@angular/core';
import { LogEntry } from './api.service';
import {
  ReviewReport,
  DashboardMetrics
} from './models';

@Injectable({
  providedIn: 'root'
})
export class GitMindStateService {
  // --- UI & STATE SIGNALS ---
  
  prUrl = signal(''); 
  diffInput = signal(''); 
  isAnalyzing = signal(false); 
  currentTab = signal('diff'); 
  logs = signal<LogEntry[]>([]); 
  analysisData = signal<ReviewReport | null>(null); 
  critiqueData = signal<{ score: number, feedback?: string, accurate?: boolean } | null>(null); 
  autoFixes = signal<any | null>(null); 
  generatedTests = signal<any | null>(null); 
  archReview = signal<any | null>(null); 
  errorMessage = signal<string | null>(null); 
  successMessage = signal<string | null>(null); 
  selectedFilePath = signal<string | null>(null); 
  analysisHistory = signal<any[]>([]); 
  dashboardMetrics = signal<DashboardMetrics | null>(null); 
  tabLoading = signal(false); 
  tokensSaved = signal(0);
  
  // Human-in-the-loop signals
  threadId = signal<string | null>(null); 
  isAwaitingFeedback = signal(false); 
  userFeedback = signal(''); 
  
  // Model Selection & Credentials
  selectedProvider = signal('gemini');
  selectedModel = signal('gemini-1.5-flash');
  userApiKey = signal(''); 
  githubToken = signal(''); 

  appendLog(type: LogEntry['type'], msg: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.logs.update(logs => [...logs, { time, type, msg }]);
  }

  clearError() {
    this.errorMessage.set(null);
  }

  clearSuccess() {
    this.successMessage.set(null);
  }
}
