import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { SearchFilingsResult } from '../../models/agent.models';

@Component({
  selector: 'app-filing-snippets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './filing-snippets.html',
  styleUrl: './filing-snippets.scss',
})
export class FilingSnippetsComponent {
  @Input() results: SearchFilingsResult[] = [];
}
