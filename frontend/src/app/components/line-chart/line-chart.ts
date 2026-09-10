import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

export interface LinePoint {
  label: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 28;
const PADDING_SIDE = 12;

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.scss',
})
export class LineChartComponent {
  private readonly dataSig = signal<LinePoint[]>([]);

  @Input() set data(value: LinePoint[]) {
    this.dataSig.set(value ?? []);
  }
  @Input() title = '';
  @Input() color = 'var(--accent)';
  @Input() valueFormatter: (v: number) => string = (v) => v.toFixed(2);

  readonly width = WIDTH;
  readonly height = HEIGHT;

  private readonly bounds = computed(() => {
    const values = this.dataSig().map((d) => d.value);
    return { max: Math.max(...values, 0), min: Math.min(...values, 0) };
  });

  readonly points = computed(() => {
    const data = this.dataSig();
    if (data.length === 0) return [];
    const { max, min } = this.bounds();
    const range = max - min || 1;
    const plotWidth = WIDTH - PADDING_SIDE * 2;
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

    return data.map((d, i) => ({
      x: PADDING_SIDE + i * step,
      y: PADDING_TOP + plotHeight - ((d.value - min) / range) * plotHeight,
      label: d.label,
      value: d.value,
    }));
  });

  readonly pathD = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  });

  readonly firstPoint = computed(() => this.points()[0]);
  readonly lastPoint = computed(() => this.points()[this.points().length - 1]);

  readonly xLabels = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return [];
    if (pts.length <= 6) return pts;
    const step = Math.ceil(pts.length / 6);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  });
}
