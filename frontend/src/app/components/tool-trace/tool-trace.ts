import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ToolTraceEntry } from '../../models/agent.models';

const TOOL_LABELS: Record<string, string> = {
  get_financials: 'get_financials',
  get_stock_data: 'get_stock_data',
  calculate_ratios: 'calculate_ratios',
  search_filings: 'search_filings',
};

@Component({
  selector: 'app-tool-trace',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tool-trace.html',
  styleUrl: './tool-trace.scss',
})
export class ToolTraceComponent {
  @Input() trace: ToolTraceEntry[] = [];
  expanded = new Set<number>();

  label(tool: string): string {
    return TOOL_LABELS[tool] ?? tool;
  }

  toggle(i: number): void {
    if (this.expanded.has(i)) this.expanded.delete(i);
    else this.expanded.add(i);
  }

  isExpanded(i: number): boolean {
    return this.expanded.has(i);
  }

  pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
