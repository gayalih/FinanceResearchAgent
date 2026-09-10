import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { marked } from 'marked';
import { AgentService } from '../../services/agent.service';
import {
  AgentRunResult,
  CalculateRatiosResult,
  GetFinancialsResult,
  GetStockDataResult,
  SearchFilingsResult,
} from '../../models/agent.models';
import { BarChartComponent, BarDatum } from '../bar-chart/bar-chart';
import { LineChartComponent, LinePoint } from '../line-chart/line-chart';
import { RatioTableComponent } from '../ratio-table/ratio-table';
import { ToolTraceComponent } from '../tool-trace/tool-trace';
import { FilingSnippetsComponent } from '../filing-snippets/filing-snippets';

const EXAMPLES = [
  'Analyze whether Apple has improved financially over the last five years.',
  'Has Microsoft become more or less profitable over the last 5 years?',
  'Compare how leveraged Tesla is today versus 5 years ago.',
  'How has NVIDIA’s financial health trended over the last 5 years?',
];

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    BarChartComponent,
    LineChartComponent,
    RatioTableComponent,
    ToolTraceComponent,
    FilingSnippetsComponent,
  ],
  templateUrl: './research.html',
  styleUrl: './research.scss',
})
export class ResearchComponent {
  readonly examples = EXAMPLES;
  readonly question = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<AgentRunResult | null>(null);
  readonly activeTab = signal<'analysis' | 'trace'>('analysis');

  readonly answerHtml = computed(() => {
    const r = this.result();
    if (!r) return '';
    return marked.parse(r.answer, { async: false }) as string;
  });

  readonly financials = computed<GetFinancialsResult | null>(() => {
    const list = this.result()?.toolOutputsByName['get_financials'] as GetFinancialsResult[] | undefined;
    return list?.[list.length - 1] ?? null;
  });

  readonly ratios = computed<CalculateRatiosResult | null>(() => {
    const list = this.result()?.toolOutputsByName['calculate_ratios'] as CalculateRatiosResult[] | undefined;
    return list?.[list.length - 1] ?? null;
  });

  readonly stockData = computed<GetStockDataResult | null>(() => {
    const list = this.result()?.toolOutputsByName['get_stock_data'] as GetStockDataResult[] | undefined;
    return list?.[list.length - 1] ?? null;
  });

  readonly filingResults = computed<SearchFilingsResult[]>(() => {
    const list = this.result()?.toolOutputsByName['search_filings'] as SearchFilingsResult[] | undefined;
    return list ?? [];
  });

  readonly revenueBars = computed<BarDatum[]>(() => {
    const f = this.financials();
    if (!f) return [];
    return f.years.map((y) => ({ label: String(y.fiscalYear), value: y.revenue }));
  });

  readonly netIncomeBars = computed<BarDatum[]>(() => {
    const f = this.financials();
    if (!f) return [];
    return f.years.map((y) => ({ label: String(y.fiscalYear), value: y.netIncome }));
  });

  readonly stockLine = computed<LinePoint[]>(() => {
    const s = this.stockData();
    if (!s) return [];
    return s.monthlySeries.map((p) => ({ label: p.date.slice(0, 7), value: p.close }));
  });

  constructor(private readonly agentService: AgentService) {}

  useExample(example: string): void {
    this.question.set(example);
  }

  submit(): void {
    const q = this.question().trim();
    if (!q || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.agentService.analyze(q).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? err?.message ?? 'Something went wrong talking to the backend.');
        this.loading.set(false);
      },
    });
  }

  formatCurrency(v: number): string {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toLocaleString()}`;
  }

  formatPrice(v: number): string {
    return `$${v.toFixed(2)}`;
  }
}
