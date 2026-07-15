import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Plus, Save, Trash2, X } from 'lucide-react';
import type { AppSettings, ProviderKind, ProviderProfile, ProviderProfileInput } from '../../shared/types';

const PROVIDER_OPTIONS: Array<{ value: ProviderKind; label: string; baseUrl: string; model: string }> = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { value: 'dashscope', label: 'Qwen / DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { value: 'volcengine', label: 'Doubao / Ark', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  { value: 'openai-compatible', label: 'OpenAI compatible', baseUrl: '', model: '' },
];

function toInput(profile?: ProviderProfile): ProviderProfileInput {
  return profile ? { ...profile, apiKey: '' } : {
    id: crypto.randomUUID(),
    name: 'New model',
    provider: 'deepseek',
    baseUrl: PROVIDER_OPTIONS[0].baseUrl,
    model: PROVIDER_OPTIONS[0].model,
    timeoutMs: 30_000,
    isDefault: false,
    apiKey: '',
  };
}

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onClose(): void;
  onChanged(settings: AppSettings): void;
}

export function SettingsDialog({ open, settings, onClose, onChanged }: SettingsDialogProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(settings.profiles[0]?.id);
  const selected = useMemo(() => settings.profiles.find((profile) => profile.id === selectedId), [settings.profiles, selectedId]);
  const [draft, setDraft] = useState<ProviderProfileInput>(() => toInput(selected));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(toInput(selected)), [selected?.id]);
  useEffect(() => {
    if (!selectedId && settings.profiles[0]) setSelectedId(settings.profiles[0].id);
  }, [settings.profiles, selectedId]);

  if (!open) return null;

  const updateProvider = (provider: ProviderKind) => {
    const defaults = PROVIDER_OPTIONS.find((item) => item.value === provider)!;
    setDraft((current) => ({ ...current, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
  };

  const refresh = async () => onChanged(await window.relayTerminal.settings.get());
  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      const result = await window.relayTerminal.settings.saveProfile(draft);
      setSelectedId(result.profile.id);
      setStatus(result.persistedSecret || !draft.apiKey ? 'Saved.' : 'Saved. The API key will be kept only for this app session.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save this profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="dialog-header">
          <div><span className="eyebrow">Preferences</span><h2>Terminal settings</h2></div>
          <button className="icon-button" onClick={onClose} title="Close settings"><X size={18} /></button>
        </header>
        <div className="settings-body">
          <nav className="profile-list" aria-label="Model profiles">
            <div className="section-label">Model profiles</div>
            {settings.profiles.map((profile) => (
              <button key={profile.id} className={profile.id === selectedId ? 'profile-item active' : 'profile-item'} onClick={() => setSelectedId(profile.id)}>
                <span>{profile.name}</span>{profile.isDefault && <Check size={14} />}
              </button>
            ))}
            <button className="text-button add-profile" onClick={() => { setSelectedId(undefined); setDraft(toInput()); setStatus(''); }}><Plus size={16} />Add profile</button>
          </nav>
          <div className="settings-form">
            {!settings.secureStorageAvailable && <div className="storage-warning"><KeyRound size={16} />Secure OS storage is unavailable. New API keys stay in memory only.</div>}
            <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Provider<select value={draft.provider} onChange={(event) => updateProvider(event.target.value as ProviderKind)}>{PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Base URL<input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
            <label>Model<input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="Model or endpoint ID" /></label>
            <label>API key<input type="password" value={draft.apiKey ?? ''} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={selected?.hasApiKey ? 'Stored - leave blank to keep' : 'Required'} autoComplete="off" /></label>
            <div className="settings-row">
              <label>Timeout<input type="number" min={5} max={120} value={draft.timeoutMs / 1000} onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) * 1000 })} /></label>
              <label className="checkbox-label"><input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} />Default profile</label>
            </div>
            <label>AI shortcut<select value={settings.aiShortcut} onChange={async (event) => onChanged(await window.relayTerminal.settings.update({ aiShortcut: event.target.value }))}>
              <option value="CommandOrControl+Shift+G">Ctrl/Cmd + Shift + G</option>
              <option value="CommandOrControl+Shift+Space">Ctrl/Cmd + Shift + Space</option>
              <option value="CommandOrControl+Alt+G">Ctrl/Cmd + Alt + G</option>
            </select></label>
            {status && <div className="form-status">{status}</div>}
            <footer className="dialog-actions">
              {selected && <button className="danger-button" onClick={async () => { await window.relayTerminal.settings.deleteProfile(selected.id); setSelectedId(undefined); setDraft(toInput()); await refresh(); }}><Trash2 size={16} />Delete</button>}
              <span className="action-spacer" />
              <button className="text-button" disabled={busy || !draft.apiKey && !selected?.hasApiKey} onClick={async () => { setBusy(true); const result = await window.relayTerminal.settings.testProfile(draft); setStatus(result.message); setBusy(false); }}><KeyRound size={16} />Test</button>
              <button className="primary-button" disabled={busy || !draft.name || !draft.baseUrl || !draft.model} onClick={save}><Save size={16} />Save</button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
