import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-agent-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentControlsComponent {
  @Input() prUrl: string = '';
  @Input() diffInput: string = '';
  @Input() isAnalyzing: boolean = false;
  
  @Input() selectedProvider: string = 'gemini';
  @Input() selectedModel: string = 'gemini-1.5-flash';
  @Input() currentModelOptions: { label: string, value: string }[] = [];
  @Input() userApiKey: string = '';
  @Input() githubToken: string = '';
  @Input() opts: any;

  @Output() prUrlChange = new EventEmitter<string>();
  @Output() fetchPrDiff = new EventEmitter<void>();
  @Output() selectedProviderChange = new EventEmitter<string>();
  @Output() selectedModelChange = new EventEmitter<string>();
  @Output() providerChangeAction = new EventEmitter<void>();
  @Output() modelChangeAction = new EventEmitter<void>();
  @Output() userApiKeyChange = new EventEmitter<string>();
  @Output() saveSettings = new EventEmitter<void>();
  @Output() githubTokenChange = new EventEmitter<string>();
  @Output() tokenInputChange = new EventEmitter<string>();
  @Output() loadExample = new EventEmitter<void>();
  @Output() startAnalysis = new EventEmitter<void>();

  onProviderChange() {
    this.providerChangeAction.emit();
  }

  onModelChange() {
    this.modelChangeAction.emit();
  }

  onSaveSettings() {
    this.saveSettings.emit();
  }
}
