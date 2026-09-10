import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AgentRunResult } from '../models/agent.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  analyze(question: string): Observable<AgentRunResult> {
    return this.http.post<AgentRunResult>(`${this.baseUrl}/analyze`, { question });
  }

  health(): Observable<{ ok: boolean; hasApiKey: boolean }> {
    return this.http.get<{ ok: boolean; hasApiKey: boolean }>(`${this.baseUrl}/health`);
  }
}
