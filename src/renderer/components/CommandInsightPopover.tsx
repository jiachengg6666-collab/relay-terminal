import { AlertTriangle, CheckCircle2, Copy, CornerDownLeft, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { CommandSuggestion } from '../../shared/types';

interface CommandInsightPopoverProps {
  busy: boolean;
  suggestion?: CommandSuggestion;
  error?: string;
  onCancel(): void;
  onRetry(): void;
  onDismiss(): void;
  onInsert(command: string): void;
}

export function CommandInsightPopover({
  busy,
  suggestion,
  error,
  onCancel,
  onRetry,
  onDismiss,
  onInsert,
}: CommandInsightPopoverProps) {
  return (
    <aside className={`command-insight ${error ? 'has-error' : ''}`} data-risk={suggestion?.risk.level} aria-live="polite">
      {busy && (
        <div className="insight-state">
          <LoaderCircle className="spin" size={18} />
          <div><strong>Generating command</strong><span>Reading terminal context</span></div>
          <button className="icon-button" onClick={onCancel} title="Cancel"><X size={16} /></button>
        </div>
      )}
      {!busy && error && (
        <div className="insight-state error-state">
          <AlertTriangle size={18} />
          <div><strong>Request failed</strong><span>{error}</span></div>
          <button className="icon-button" onClick={onRetry} title="Retry"><RefreshCw size={16} /></button>
          <button className="icon-button" onClick={onDismiss} title="Dismiss"><X size={16} /></button>
        </div>
      )}
      {!busy && suggestion && (
        <>
          <div className="insight-heading">
            {suggestion.risk.level === 'low' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <strong>{suggestion.source === 'correct' ? 'Correction ready' : 'Command ready'}</strong>
            <span className={`risk-badge risk-${suggestion.risk.level}`}>{suggestion.risk.level} risk</span>
            <span className="action-spacer" />
            <button className="icon-button" onClick={() => void navigator.clipboard.writeText(suggestion.command)} title="Copy command"><Copy size={16} /></button>
            <button className="icon-button" onClick={onRetry} title="Regenerate"><RefreshCw size={16} /></button>
            <button className="icon-button" onClick={onDismiss} title="Dismiss"><X size={16} /></button>
          </div>
          <p>{suggestion.explanation}</p>
          {suggestion.risk.reasons.length > 0 && <small>{suggestion.risk.reasons.join(' · ')}</small>}
          {suggestion.risk.level === 'high' && (
            <div className="high-risk-command">
              <code>{suggestion.command}</code>
              <button className="text-button" onClick={() => onInsert(suggestion.command)}><CornerDownLeft size={15} />Insert</button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
