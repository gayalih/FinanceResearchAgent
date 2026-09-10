import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { CalculateRatiosResult } from '../../models/agent.models';

@Component({
  selector: 'app-ratio-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ratio-table.html',
  styleUrl: './ratio-table.scss',
})
export class RatioTableComponent {
  @Input() ratios!: CalculateRatiosResult;

  pct(v: number | null): string {
    return v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  }

  ratio(v: number | null): string {
    return v === null ? '—' : v.toFixed(2);
  }

  trendIcon(t: string): string {
    switch (t) {
      case 'improving':
        return '▲';
      case 'declining':
        return '▼';
      case 'flat':
        return '▬';
      default:
        return '?';
    }
  }
}
