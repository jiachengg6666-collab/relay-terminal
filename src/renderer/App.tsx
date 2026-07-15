import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  TerminalSquare,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AiRequest,
  AppPlatform,
  AppSettings,
  CommandSuggestion,
  ShellProfile,
  TerminalSession,
} from '../shared/types';
import { SettingsDialog } from './components/SettingsDialog';
import { CommandInsightPopover } from './components/CommandInsightPopover';
import { TerminalPane, type TerminalPaneHandle } from './components/TerminalPane';

interface UiSession extends TerminalSession {
  shell: ShellProfile;
}

interface RequestTemplate extends Omit<AiRequest, 'requestId'> {}

interface AiViewState {
  open: boolean;
  busy: boolean;
  suggestion?: CommandSuggestion;
  error?: string;
  lastRequest?: RequestTemplate;
}

function platformName(): AppPlatform {
  const value = navigator.userAgent.toLowerCase();
  if (value.includes('windows')) return 'win32';
  if (value.includes('mac')) return 'darwin';
  return 'linux';
}

function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  const command = event.ctrlKey || event.metaKey;
  if (!command) return false;
  const needsShift = shortcut.includes('+Shift+');
  if (event.shiftKey !== needsShift) return false;
  if (shortcut.includes('+Alt+') && !event.altKey) return false;
  if (!shortcut.includes('+Alt+') && event.altKey) return false;
  if (shortcut.endsWith('+Space')) return event.code === 'Space';
  return event.code === 'KeyG';
}

function effectiveTheme(theme: AppSettings['theme']): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [settings, setSettings] = useState<AppSettings>();
  const [sessions, setSessions] = useState<UiSession[]>([]);
  const sessionsRef = useRef<UiSession[]>([]);
  const [activeId, setActiveId] = useState('');
  const [selectedShellId, setSelectedShellId] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiViews, setAiViews] = useState<Record<string, AiViewState>>({});
  const terminalRefs = useRef(new Map<string, TerminalPaneHandle>());
  const requestIds = useRef(new Map<string, string>());

  const activeSession = sessions.find((session) => session.id === activeId);
  const activeAiView = activeId ? aiViews[activeId] : undefined;
  const theme = effectiveTheme(settings?.theme ?? 'dark');

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    void Promise.all([window.relayTerminal.terminal.listShells(), window.relayTerminal.settings.get()]).then(([availableShells, appSettings]) => {
      const available = availableShells.filter((shell) => shell.available);
      setShells(availableShells);
      setSettings(appSettings);
      const preferred = available.find((shell) => shell.id === appSettings.defaultShellProfileId) ?? available[0];
      if (preferred) {
        setSelectedShellId(preferred.id);
        const id = crypto.randomUUID();
        setSessions([{
          id,
          title: preferred.name,
          shellProfileId: preferred.id,
          shellKind: preferred.kind,
          cwd: '',
          aiEnabled: false,
          shell: preferred,
        }]);
        setActiveId(id);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const requestAi = async (template: RequestTemplate, insertIntoTerminal = false) => {
    const previousId = requestIds.current.get(template.sessionId);
    if (previousId) window.relayTerminal.ai.cancel(previousId);
    const requestId = crypto.randomUUID();
    requestIds.current.set(template.sessionId, requestId);
    setAiViews((current) => ({
      ...current,
      [template.sessionId]: { open: true, busy: true, lastRequest: template },
    }));
    try {
      const suggestion = await window.relayTerminal.ai.request({ ...template, requestId });
      if (requestIds.current.get(template.sessionId) !== requestId) return;
      if (insertIntoTerminal && suggestion.risk.level !== 'high') {
        window.relayTerminal.terminal.insertCommand(template.sessionId, suggestion.command);
        terminalRefs.current.get(template.sessionId)?.focus();
      }
      setAiViews((current) => ({
        ...current,
        [template.sessionId]: { open: true, busy: false, suggestion, lastRequest: template },
      }));
    } catch (error) {
      if (requestIds.current.get(template.sessionId) !== requestId) return;
      setAiViews((current) => ({
        ...current,
        [template.sessionId]: {
          open: true,
          busy: false,
          error: error instanceof Error ? error.message : 'The model request failed.',
          lastRequest: template,
        },
      }));
    } finally {
      if (requestIds.current.get(template.sessionId) === requestId) requestIds.current.delete(template.sessionId);
    }
  };

  useEffect(() => window.relayTerminal.terminal.onCommandFinished((event) => {
    const session = sessionsRef.current.find((candidate) => candidate.id === event.sessionId);
    if (!session?.aiEnabled || !session.providerProfileId || event.interrupted) return;
    void requestAi({
      sessionId: session.id,
      profileId: session.providerProfileId,
      kind: 'correct',
      shell: session.shellKind,
      cwd: event.cwd,
      platform: platformName(),
      failure: {
        command: event.command,
        cwd: event.cwd,
        shell: session.shellKind,
        platform: platformName(),
        exitCode: event.exitCode,
        output: event.output,
      },
    }, true);
  }), []);

  useEffect(() => window.relayTerminal.terminal.onNaturalLanguage((event) => {
    const session = sessionsRef.current.find((candidate) => candidate.id === event.sessionId);
    if (!session?.aiEnabled || !session.providerProfileId) return;
    void requestAi({
      sessionId: session.id,
      profileId: session.providerProfileId,
      kind: 'generate',
      shell: session.shellKind,
      cwd: event.cwd,
      platform: platformName(),
      prompt: event.prompt,
    }, true);
  }), []);

  useEffect(() => window.relayTerminal.terminal.onPromptState((event) => {
    if (!event.atPrompt) {
      setAiViews((current) => ({ ...current, [event.sessionId]: { ...current[event.sessionId], open: false } }));
    }
  }), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!settings || !activeId || settingsOpen) return;
      if (shortcutMatches(event, settings.aiShortcut)) {
        event.preventDefault();
        if (sessionsRef.current.find((session) => session.id === activeId)?.aiEnabled) {
          window.relayTerminal.terminal.write(activeId, '/ai ');
          terminalRefs.current.get(activeId)?.focus();
        }
        else if (settings.profiles.length === 0) setSettingsOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyF') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settings, activeId, settingsOpen]);

  const createSession = (shellId = selectedShellId) => {
    const shell = shells.find((candidate) => candidate.id === shellId && candidate.available);
    if (!shell) return;
    const id = crypto.randomUUID();
    const session: UiSession = {
      id,
      title: shell.name,
      shellProfileId: shell.id,
      shellKind: shell.kind,
      cwd: '',
      aiEnabled: false,
      shell,
    };
    setSessions((current) => [...current, session]);
    setActiveId(id);
  };

  const closeSession = (sessionId: string) => {
    const requestId = requestIds.current.get(sessionId);
    if (requestId) {
      window.relayTerminal.ai.cancel(requestId);
      requestIds.current.delete(sessionId);
    }
    void window.relayTerminal.terminal.close(sessionId);
    setSessions((current) => {
      const index = current.findIndex((session) => session.id === sessionId);
      const next = current.filter((session) => session.id !== sessionId);
      if (activeId === sessionId) setActiveId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? '');
      return next;
    });
  };

  const toggleAi = async () => {
    if (!activeSession || !settings) return;
    const enabled = !activeSession.aiEnabled;
    const profileId = activeSession.providerProfileId ?? settings.defaultProviderProfileId ?? settings.profiles[0]?.id;
    if (enabled && !profileId) {
      setSettingsOpen(true);
      return;
    }
    try {
      await window.relayTerminal.terminal.setAiEnabled(activeSession.id, enabled, profileId);
      setSessions((current) => current.map((session) => session.id === activeSession.id
        ? { ...session, aiEnabled: enabled, providerProfileId: enabled ? profileId : undefined }
        : session));
      if (!enabled) {
        const requestId = requestIds.current.get(activeSession.id);
        if (requestId) {
          window.relayTerminal.ai.cancel(requestId);
          requestIds.current.delete(activeSession.id);
        }
        setAiViews((current) => ({ ...current, [activeSession.id]: { open: false, busy: false } }));
      }
    } catch {
      setSettingsOpen(true);
    }
  };

  const selectProvider = async (profileId: string) => {
    if (!activeSession) return;
    const requestId = requestIds.current.get(activeSession.id);
    if (requestId) {
      window.relayTerminal.ai.cancel(requestId);
      requestIds.current.delete(activeSession.id);
    }
    try {
      await window.relayTerminal.terminal.setAiEnabled(activeSession.id, true, profileId);
      setSessions((current) => current.map((session) => session.id === activeSession.id ? { ...session, providerProfileId: profileId } : session));
    } catch {
      setSettingsOpen(true);
    }
  };

  const applySettings = (nextSettings: AppSettings) => {
    setSettings(nextSettings);
    const validProfiles = new Set(nextSettings.profiles.map((profile) => profile.id));
    for (const session of sessionsRef.current) {
      if (session.aiEnabled && session.providerProfileId && !validProfiles.has(session.providerProfileId)) {
        const requestId = requestIds.current.get(session.id);
        if (requestId) {
          window.relayTerminal.ai.cancel(requestId);
          requestIds.current.delete(session.id);
        }
        void window.relayTerminal.terminal.setAiEnabled(session.id, false).catch(() => undefined);
      }
    }
    setSessions((current) => current.map((session) => session.providerProfileId && !validProfiles.has(session.providerProfileId)
      ? { ...session, aiEnabled: false, providerProfileId: undefined }
      : session));
  };

  const dismissInsight = (sessionId: string) => {
    const requestId = requestIds.current.get(sessionId);
    if (requestId) {
      window.relayTerminal.ai.cancel(requestId);
      requestIds.current.delete(sessionId);
    }
    setAiViews((current) => ({ ...current, [sessionId]: { ...current[sessionId], open: false, busy: false } }));
  };

  const retrySuggestion = (sessionId: string) => {
    const lastRequest = aiViews[sessionId]?.lastRequest;
    if (!lastRequest) return;
    window.relayTerminal.terminal.clearInput(sessionId);
    void requestAi(lastRequest, true);
  };

  const insertHighRiskSuggestion = (sessionId: string, command: string) => {
    window.relayTerminal.terminal.insertCommand(sessionId, command);
    terminalRefs.current.get(sessionId)?.focus();
  };

  const displayedSessions = useMemo(() => sessions, [sessions]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-label="Relay Terminal"><TerminalSquare size={18} /><span>Relay</span></div>
        <div className="tab-strip" role="tablist" aria-label="Terminal sessions">
          {displayedSessions.map((session) => (
            <button key={session.id} role="tab" aria-selected={session.id === activeId} className={session.id === activeId ? 'terminal-tab active' : 'terminal-tab'} onClick={() => setActiveId(session.id)}>
              <TerminalSquare size={14} />
              <span>{session.title}</span>
              {session.aiEnabled && <i className="ai-dot" aria-label="AI enabled" />}
              <X className="tab-close" size={14} onClick={(event) => { event.stopPropagation(); closeSession(session.id); }} />
            </button>
          ))}
        </div>
        <div className="new-session-control">
          <button className="icon-button" onClick={() => createSession()} title="New terminal"><Plus size={17} /></button>
          <select value={selectedShellId} onChange={async (event) => {
            const shellId = event.target.value;
            setSelectedShellId(shellId);
            if (settings) setSettings(await window.relayTerminal.settings.update({ defaultShellProfileId: shellId }));
          }} aria-label="Shell for new terminal">
            {shells.filter((shell) => shell.available).map((shell) => <option key={shell.id} value={shell.id}>{shell.name}</option>)}
          </select>
          <ChevronDown className="select-chevron" size={13} aria-hidden="true" />
        </div>
      </header>

      <section className="command-bar">
        <button className={activeSession?.aiEnabled ? 'ai-toggle enabled' : 'ai-toggle'} role="switch" aria-checked={activeSession?.aiEnabled ?? false} onClick={toggleAi} disabled={!activeSession}>
          <Sparkles size={16} /><span>{activeSession?.aiEnabled ? 'AI on' : 'AI off'}</span><i />
        </button>
        {activeSession?.aiEnabled && settings && (
          <select className="provider-select" value={activeSession.providerProfileId} onChange={(event) => void selectProvider(event.target.value)} aria-label="Model profile">
            {settings.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        )}
        <span className="toolbar-spacer" />
        {searchOpen && (
          <div className="search-control">
            <Search size={15} />
            <input autoFocus value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); terminalRefs.current.get(activeId)?.searchNext(event.target.value); }} placeholder="Find in terminal" aria-label="Find in terminal" />
            <button className="icon-button" onClick={() => terminalRefs.current.get(activeId)?.searchPrevious(searchQuery)} title="Previous match"><ChevronLeft size={15} /></button>
            <button className="icon-button" onClick={() => terminalRefs.current.get(activeId)?.searchNext(searchQuery)} title="Next match"><ChevronRight size={15} /></button>
            <button className="icon-button" onClick={() => { setSearchOpen(false); setSearchQuery(''); terminalRefs.current.get(activeId)?.focus(); }} title="Close search"><X size={15} /></button>
          </div>
        )}
        {!searchOpen && <button className="icon-button" onClick={() => setSearchOpen(true)} title="Find"><Search size={16} /></button>}
        <div className="zoom-control">
          <button className="icon-button" onClick={() => setFontSize((size) => Math.max(10, size - 1))} title="Zoom out"><ZoomOut size={16} /></button>
          <button className="zoom-value" onClick={() => setFontSize(14)} title="Reset zoom">{fontSize}px</button>
          <button className="icon-button" onClick={() => setFontSize((size) => Math.min(24, size + 1))} title="Zoom in"><ZoomIn size={16} /></button>
        </div>
        <button className="icon-button" onClick={async () => settings && setSettings(await window.relayTerminal.settings.update({ theme: theme === 'dark' ? 'light' : 'dark' }))} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Settings"><Settings size={16} /></button>
      </section>

      <section className="workspace">
        <div className="terminal-stack">
          {displayedSessions.map((session) => (
            <TerminalPane
              key={session.id}
              ref={(handle) => { if (handle) terminalRefs.current.set(session.id, handle); else terminalRefs.current.delete(session.id); }}
              sessionId={session.id}
              shell={session.shell}
              active={session.id === activeId}
              fontSize={fontSize}
              theme={theme}
              onCreated={(created) => setSessions((current) => current.map((candidate) => candidate.id === created.id ? { ...candidate, ...created } : candidate))}
              onExited={() => undefined}
              onCwdChanged={(sessionId, cwd) => setSessions((current) => current.map((candidate) => candidate.id === sessionId ? { ...candidate, cwd } : candidate))}
            />
          ))}
          {sessions.length === 0 && (
            <div className="empty-terminal"><TerminalSquare size={28} /><button className="primary-button" onClick={() => createSession()}><Plus size={16} />New terminal</button></div>
          )}
        </div>
        {activeSession && activeAiView?.open && (
          <CommandInsightPopover
            busy={activeAiView?.busy ?? false}
            suggestion={activeAiView.suggestion}
            error={activeAiView.error}
            onCancel={() => dismissInsight(activeSession.id)}
            onRetry={() => retrySuggestion(activeSession.id)}
            onDismiss={() => dismissInsight(activeSession.id)}
            onInsert={(command) => insertHighRiskSuggestion(activeSession.id, command)}
          />
        )}
      </section>

      {settings && <SettingsDialog open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onChanged={applySettings} />}

    </main>
  );
}
