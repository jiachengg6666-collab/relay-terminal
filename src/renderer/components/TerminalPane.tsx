import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import type { ShellProfile, TerminalSession } from '../../shared/types';

export interface TerminalPaneHandle {
  fit(): void;
  focus(): void;
  searchNext(query: string): boolean;
  searchPrevious(query: string): boolean;
}

interface TerminalPaneProps {
  sessionId: string;
  shell: ShellProfile;
  active: boolean;
  fontSize: number;
  theme: 'dark' | 'light';
  onCreated(session: TerminalSession): void;
  onExited(sessionId: string): void;
  onCwdChanged(sessionId: string, cwd: string): void;
}

const DARK_THEME = {
  background: '#101214',
  foreground: '#e7e9e8',
  cursor: '#61d095',
  cursorAccent: '#101214',
  selectionBackground: '#355a49aa',
  black: '#202422',
  red: '#f06c75',
  green: '#61d095',
  yellow: '#e6b450',
  blue: '#7aa2d6',
  magenta: '#bd93d8',
  cyan: '#5ccfe6',
  white: '#e7e9e8',
  brightBlack: '#6c736f',
};

const LIGHT_THEME = {
  background: '#f4f6f5',
  foreground: '#111713',
  cursor: '#147a4b',
  cursorAccent: '#f7f8f7',
  selectionBackground: '#a9d8c0aa',
  black: '#111713',
  red: '#b42333',
  green: '#147a4b',
  yellow: '#8a5c00',
  blue: '#2f62a0',
  magenta: '#76469a',
  cyan: '#187083',
  white: '#37413b',
  brightBlack: '#59645d',
  brightRed: '#941d2a',
  brightGreen: '#075f39',
  brightYellow: '#704a00',
  brightBlue: '#234f85',
  brightMagenta: '#633a82',
  brightCyan: '#125c6a',
  brightWhite: '#111713',
};

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(function TerminalPane(
  { sessionId, shell, active, fontSize, theme, onCreated, onExited, onCwdChanged },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const readyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    fit: () => fitRef.current?.fit(),
    focus: () => terminalRef.current?.focus(),
    searchNext: (query) => searchRef.current?.findNext(query, { incremental: true }) ?? false,
    searchPrevious: (query) => searchRef.current?.findPrevious(query) ?? false,
  }), []);

  useEffect(() => {
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize,
      lineHeight: 1.15,
      minimumContrastRatio: 4.5,
      scrollback: 10_000,
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(containerRef.current!);
    fit.fit();
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;

    const container = containerRef.current!;
    let isComposing = false;
    const handleCompositionStart = () => { isComposing = true; };
    const handleCompositionEnd = () => { isComposing = false; };
    const handleMacImeKeyDown = (event: KeyboardEvent) => {
      if (!navigator.userAgent.includes('Macintosh') || event.keyCode !== 229 || event.isComposing || isComposing) return;

      // Apple Pinyin can emit insertText before a non-composing keyCode 229 keydown.
      // Let xterm handle the input event once, but block its delayed textarea diff.
      event.stopImmediatePropagation();
    };
    container.addEventListener('compositionstart', handleCompositionStart, true);
    container.addEventListener('compositionend', handleCompositionEnd, true);
    container.addEventListener('keydown', handleMacImeKeyDown, true);

    const unsubData = window.relayTerminal.terminal.onData((event) => {
      if (event.sessionId === sessionId) terminal.write(event.data);
    });
    const unsubExit = window.relayTerminal.terminal.onExit((event) => {
      if (event.sessionId === sessionId) {
        terminal.writeln(`\r\n[process exited with code ${event.exitCode}]`);
        onExited(sessionId);
      }
    });
    const unsubCwd = window.relayTerminal.terminal.onCwd((event) => {
      if (event.sessionId === sessionId) onCwdChanged(event.sessionId, event.cwd);
    });
    const inputDisposable = terminal.onData((data) => window.relayTerminal.terminal.write(sessionId, data));
    terminal.attachCustomKeyEventHandler((event) => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.shiftKey && event.code === 'KeyC' && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      if (commandKey && event.shiftKey && event.code === 'KeyV') {
        void navigator.clipboard.readText().then((text) => window.relayTerminal.terminal.write(sessionId, text));
        return false;
      }
      return true;
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (readyRef.current) window.relayTerminal.terminal.resize(sessionId, terminal.cols, terminal.rows);
    });
    observer.observe(containerRef.current!);

    let disposed = false;
    void window.relayTerminal.terminal.create({
      sessionId,
      shellProfileId: shell.id,
      cols: terminal.cols,
      rows: terminal.rows,
    }).then((session) => {
      if (disposed) {
        void window.relayTerminal.terminal.close(sessionId);
        return;
      }
      readyRef.current = true;
      window.relayTerminal.terminal.resize(sessionId, terminal.cols, terminal.rows);
      onCreated(session);
    }).catch((error) => terminal.writeln(`\r\nUnable to start shell: ${String(error)}`));

    return () => {
      disposed = true;
      readyRef.current = false;
      observer.disconnect();
      container.removeEventListener('compositionstart', handleCompositionStart, true);
      container.removeEventListener('compositionend', handleCompositionEnd, true);
      container.removeEventListener('keydown', handleMacImeKeyDown, true);
      inputDisposable.dispose();
      unsubData();
      unsubExit();
      unsubCwd();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      void window.relayTerminal.terminal.close(sessionId);
    };
  }, [sessionId, shell.id]);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.options.fontSize = fontSize;
    terminalRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    fitRef.current?.fit();
  }, [fontSize, theme]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [active]);

  return <div className={`terminal-pane ${active ? 'is-active' : ''}`} ref={containerRef} aria-label={`${shell.name} terminal`} />;
});
