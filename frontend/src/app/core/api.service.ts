import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenService } from './auth/token.service';

export interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'accent';
  msg: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private baseUrl = 'http://localhost:8000';

  fetchDiff(url: string): Observable<{ diff: string }> {
    return this.http.get<{ diff: string }>(`${this.baseUrl}/fetch-diff`, { params: { url } });
  }

  analyze(payload: any): Observable<string> {
    return this.createSseObservable(`${this.baseUrl}/analyze`, payload);
  }

  provideFeedback(threadId: string, feedback: string): Observable<string> {
    return this.createSseObservable(`${this.baseUrl}/feedback`, { thread_id: threadId, feedback });
  }

  pushComment(githubUrl: string, item: any, token: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/push-to-github`, {
      github_url: githubUrl,
      item: item,
      github_token: token
    });
  }

  getHistory(repo?: string): Observable<any[]> {
    const params: any = {};
    if (repo) params.repo = repo;
    return this.http.get<any[]>(`${this.baseUrl}/history`, { params });
  }

  getAnalysis(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/history/${id}`);
  }

  applyFix(githubUrl: string, filePath: string, originalCode: string, fixedCode: string, token: string, commitMessage?: string): Observable<any> {
    const payload: any = {
      github_url: githubUrl,
      file_path: filePath,
      original_code: originalCode,
      fixed_code: fixedCode,
      github_token: token
    };
    if (commitMessage) payload.commit_message = commitMessage;
    return this.http.post(`${this.baseUrl}/apply-fix`, payload);
  }

  suppressIssue(githubUrl: string, issueSignature: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/suppress-issue`, {
      github_url: githubUrl,
      issue_signature: issueSignature
    });
  }

  batchApplyFixes(githubUrl: string, token: string, fixes: { file_path: string; original_code: string; fixed_code: string; issue: string }[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/batch-apply-fixes`, {
      github_url: githubUrl,
      github_token: token,
      fixes
    });
  }

  private createSseObservable(url: string, payload: any): Observable<string> {
    return new Observable(observer => {
      const abortController = new AbortController();
      const token = this.tokenService.getToken();
      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      if (token) {
        headers.append('Authorization', `Bearer ${token}`);
      }

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: abortController.signal
      }).then(response => {
        if (!response.body) {
          observer.error('No response body');
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const push = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              observer.complete();
              return;
            }
            const chunk = decoder.decode(value);
            observer.next(chunk);
            push();
          }).catch(err => {
            if (err.name !== 'AbortError') {
              observer.error(err);
            }
          });
        };
        push();
      }).catch(err => {
        if (err.name !== 'AbortError') {
          observer.error(err);
        }
      });

      return () => abortController.abort();
    });
  }
}
