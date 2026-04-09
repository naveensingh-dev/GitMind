import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  private createSseObservable(url: string, payload: any): Observable<string> {
    return new Observable(observer => {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
          }).catch(err => observer.error(err));
        };
        push();
      }).catch(err => observer.error(err));
    });
  }
}
