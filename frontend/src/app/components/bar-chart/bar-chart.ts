import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number | null;
}

interface RenderedBar {
  label: string;
  value: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  negative: boolean;
  valueLabel: string;
  valueLabelY: number;
}

const WIDTH = 640;
const HEIGHT = 260;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 32;
const PADDING_SIDE = 16;

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.scss',
})
export class BarChartComponent {
  private readonly dataSig = signal<BarDatum[]>([]);

  @Input() set data(value: BarDatum[]) {
    this.dataSig.set(value ?? []);
  }
  @Input() title = '';
  @Input() valueFormatter: (v: number) => string = (v) => v.toLocaleString();
  @Input() positiveColor = 'var(--accent)';
  @Input() negativeColor = 'var(--negative)';

  readonly width = WIDTH;
  readonly height = HEIGHT;

  readonly baselineY = computed(() => this.scaleY(0));

  readonly bars = computed<RenderedBar[]>(() => {
    const data = this.dataSig();
    if (data.length === 0) return [];
    const plotWidth = WIDTH - PADDING_SIDE * 2;
    const slotWidth = plotWidth / data.length;
    const barWidth = Math.min(64, slotWidth * 0.6);

    return data.map((d, i) => {
      const value = d.value;
      const negative = (value ?? 0) < 0;
      const yZero = this.scaleY(0);
      const yValue = this.scaleY(value ?? 0);
      const x = PADDING_SIDE + i * slotWidth + (slotWidth - barWidth) / 2;
      const y = negative ? yZero : yValue;
      const height = Math.max(1, Math.abs(yZero - yValue));
      return {
        label: d.label,
        value,
        x,
        y,
        width: barWidth,
        height,
        negative,
        valueLabel: value === null ? 'n/a' : this.valueFormatter(value),
        valueLabelY: negative ? y + height + 14 : y - 6,
      };
    });
  });

  private scaleY(value: number): number {
    const data = this.dataSig();
    const values = data.map((d) => d.value ?? 0);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    return PADDING_TOP + plotHeight - ((value - min) / range) * plotHeight;
  }
}
