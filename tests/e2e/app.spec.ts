import { _electron as electron, expect, test, type Locator } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server: Server;
let port: number;
let requestCount = 0;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (!request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestCount += 1;
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const content = parsed.messages.map((message) => message.content).join('\n');
      const suggestion = content.includes('Connection test')
        ? { command: 'echo ok', explanation: 'ok' }
        : content.includes('relay_command_that_does_not_exist')
          ? { command: 'echo RELAY_CORRECTED', explanation: 'Replaces the unknown command.' }
          : { command: process.platform === 'win32' ? 'Remove-Item C:\\temp -Recurse -Force' : 'rm -rf /tmp/relay-test', explanation: 'Removes the requested directory.' };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(suggestion) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function enterMacImePassthroughPair(input: Locator): Promise<void> {
  await input.evaluate(async (textarea, [first, second]) => {
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Expected the xterm helper textarea.');
    const keyDown = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => 229 });
      textarea.dispatchEvent(event);
    };
    const keyUp = (key: string, keyCode: number) => {
      const event = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => keyCode });
      textarea.dispatchEvent(event);
    };
    const insert = (value: string) => {
      textarea.value += value;
      textarea.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: value,
        composed: true,
        bubbles: true,
      }));
    };

    insert(first);
    keyDown(first);
    keyUp(first, first.toUpperCase().charCodeAt(0));
    insert(second);
    keyDown(second);
    keyUp(second, second.toUpperCase().charCodeAt(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }, ['j', 'k']);
}

async function enterMacImeComposition(input: Locator, text: string): Promise<void> {
  await input.evaluate(async (textarea, value) => {
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Expected the xterm helper textarea.');
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
    textarea.value += value;
    textarea.dispatchEvent(new CompositionEvent('compositionupdate', { data: value, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    textarea.dispatchEvent(new CompositionEvent('compositionend', { data: value, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }, text);
}

test('edits unsubmitted input and recalls command history', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'relay-terminal-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, RELAY_USER_DATA_DIR: userData },
  });
  try {
    const page = await app.firstWindow();
    const terminal = page.locator('.terminal-pane.is-active');
    const input = terminal.locator('.xterm-helper-textarea');
    if (process.platform === 'darwin') {
      const topbarStyle = await page.locator('.topbar').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          appRegion: style.getPropertyValue('-webkit-app-region'),
          paddingLeft: Number.parseFloat(style.paddingLeft),
        };
      });
      const tabAppRegion = await page.getByRole('tab').first().evaluate((element) => (
        getComputedStyle(element).getPropertyValue('-webkit-app-region')
      ));
      expect(topbarStyle.appRegion).toBe('drag');
      expect(topbarStyle.paddingLeft).toBeGreaterThanOrEqual(78);
      expect(tabAppRegion).toBe('no-drag');
    }
    await expect(page.getByRole('switch')).toBeEnabled({ timeout: 20_000 });
    await input.focus();
    await expect.poll(async () => (
      (await terminal.innerText()).trimEnd().split('\n').at(-1)?.trim()
    )).toMatch(/[>$%#]$/);

    const promptBeforeBackspace = await terminal.innerText();
    const emptyPrompt = promptBeforeBackspace.trimEnd().split('\n').at(-1)?.trim();
    if (!emptyPrompt) throw new Error('The shell prompt did not render.');
    await page.keyboard.press('Backspace');
    await expect.poll(async () => terminal.innerText()).toBe(promptBeforeBackspace);

    await page.keyboard.type('echo RELAY_EDIT_BROKEN');
    for (let index = 0; index < 'BROKEN'.length; index += 1) await page.keyboard.press('Backspace');
    await page.keyboard.type('OK');
    await page.keyboard.press('Enter');
    await expect.poll(async () => ((await terminal.innerText()).match(/RELAY_EDIT_OK/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    await expect.poll(async () => (
      (await terminal.innerText()).trimEnd().split('\n').at(-1)?.trim()
    )).toBe(emptyPrompt);

    await input.focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await terminal.innerText()).trimEnd())
      .toMatch(/echo RELAY_EDIT_OK$/);
    await page.keyboard.press('Enter');
    await expect.poll(async () => ((await terminal.innerText()).match(/RELAY_EDIT_OK/g) ?? []).length)
      .toBeGreaterThanOrEqual(4);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('commits macOS Apple Pinyin composition without corruption', async () => {
  test.skip(process.platform !== 'darwin', 'Apple Pinyin composition is macOS-specific.');
  const userData = await mkdtemp(path.join(os.tmpdir(), 'relay-terminal-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, RELAY_USER_DATA_DIR: userData },
  });
  try {
    const page = await app.firstWindow();
    const terminal = page.locator('.terminal-pane.is-active');
    const input = terminal.locator('.xterm-helper-textarea');
    await expect(page.getByRole('switch')).toBeEnabled({ timeout: 20_000 });
    await input.focus();

    await page.keyboard.type('echo RELAY_CJK_');
    await enterMacImeComposition(input, '中文');
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await terminal.innerText()).split('\n').map((line) => line.trim()))
      .toContain('RELAY_CJK_中文');
    await expect(terminal).not.toContainText('RELAY_CJK_中文中文');
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('does not duplicate macOS Apple Pinyin passthrough input', async () => {
  test.skip(process.platform !== 'darwin', 'Apple Pinyin event ordering is macOS-specific.');
  const userData = await mkdtemp(path.join(os.tmpdir(), 'relay-terminal-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, RELAY_USER_DATA_DIR: userData },
  });
  try {
    const page = await app.firstWindow();
    const terminal = page.locator('.terminal-pane.is-active');
    const input = terminal.locator('.xterm-helper-textarea');
    await expect(page.getByRole('switch')).toBeEnabled({ timeout: 20_000 });
    await input.focus();

    await page.keyboard.type('echo RELAY_IME_');
    await enterMacImePassthroughPair(input);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await terminal.innerText()).split('\n').map((line) => line.trim()))
      .toContain('RELAY_IME_jk');
    await expect(terminal).not.toContainText('RELAY_IME_jkk');
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('creates tabs, configures AI, and replaces semantic or unresolved input before execution', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'relay-terminal-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, RELAY_USER_DATA_DIR: userData },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('Relay Terminal')).toBeVisible();

    await page.getByTitle('New terminal').click();
    await expect(page.getByRole('tab')).toHaveCount(2);
    expect(requestCount).toBe(0);

    await page.getByTitle('Settings').click();
    await page.getByRole('button', { name: 'Add profile' }).click();
    await page.getByLabel('Name').fill('Mock provider');
    await page.getByLabel('Provider').selectOption('openai-compatible');
    await page.getByLabel('Base URL').fill(`http://127.0.0.1:${port}/v1`);
    await page.getByRole('textbox', { name: 'Model', exact: true }).fill('mock-model');
    await page.getByLabel('API key').fill('test-key');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    await page.getByTitle('Close settings').click();

    const aiSwitch = page.getByRole('switch');
    try {
      await expect(aiSwitch).toBeEnabled({ timeout: 20_000 });
    } catch (error) {
      const terminalText = await page.locator('.terminal-pane.is-active .xterm-rows').innerText().catch(() => 'Terminal output unavailable.');
      throw new Error(`Terminal did not become ready. Output:\n${terminalText}`, { cause: error });
    }
    await aiSwitch.click();
    await expect(aiSwitch).toHaveAttribute('aria-checked', 'true');
    expect(requestCount).toBe(0);
    await page.locator('.terminal-pane.is-active .xterm-helper-textarea').focus();
    await page.keyboard.type('/ai remove a temporary directory');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Command ready')).toBeVisible();
    await expect(page.getByText('high risk')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert' })).toBeVisible();
    await page.getByTitle('Dismiss').click();
    await page.locator('.terminal-pane.is-active .xterm-helper-textarea').focus();
    await page.keyboard.type('relay_command_that_does_not_exist');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Replaces the unknown command.')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.terminal-pane.is-active')).toContainText('RELAY_CORRECTED');
    await expect(page.locator('.terminal-pane.is-active')).not.toContainText('CommandNotFoundException');
    expect(requestCount).toBeGreaterThanOrEqual(2);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
