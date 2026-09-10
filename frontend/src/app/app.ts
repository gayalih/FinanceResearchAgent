import { Component } from '@angular/core';
import { ResearchComponent } from './components/research/research';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResearchComponent],
  template: '<app-research></app-research>',
})
export class App {}
