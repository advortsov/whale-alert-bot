import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReleaseNotesMessage } from '../../src/release/release-notes-message.builder';

type ReleaseNotesCliOptions = {
  readonly chatId: string | null;
  readonly botToken: string | null;
  readonly title: string;
  readonly notesFile: string | null;
  readonly highlightsRaw: string | null;
  readonly appVersion: string | null;
  readonly dryRun: boolean;
};

const parseCliOptions = (argv: readonly string[]): ReleaseNotesCliOptions => {
  let chatId: string | null = process.env['RELEASE_NOTES_CHAT_ID']?.trim() ?? null;
  let botToken: string | null = process.env['BOT_TOKEN']?.trim() ?? null;
  let title: string = 'Что нового:';
  let notesFile: string | null = null;
  let highlightsRaw: string | null = null;
  let appVersion: string | null = process.env['APP_VERSION']?.trim() ?? null;
  let dryRun: boolean = false;

  for (let index: number = 0; index < argv.length; index += 1) {
    const arg: string | undefined = argv[index];

    if (typeof arg !== 'string') {
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    const value: string | undefined = argv[index + 1];

    if (
      (arg === '--chat-id' ||
        arg === '--bot-token' ||
        arg === '--title' ||
        arg === '--notes-file' ||
        arg === '--highlights' ||
        arg === '--version') &&
      typeof value !== 'string'
    ) {
      throw new Error(`Missing value for argument ${arg}`);
    }

    if (arg === '--chat-id' && typeof value === 'string') {
      chatId = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--bot-token' && typeof value === 'string') {
      botToken = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--title' && typeof value === 'string') {
      title = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--notes-file' && typeof value === 'string') {
      notesFile = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--highlights' && typeof value === 'string') {
      highlightsRaw = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--version' && typeof value === 'string') {
      appVersion = value.trim();
      index += 1;
      continue;
    }
  }

  return {
    chatId,
    botToken,
    title,
    notesFile,
    highlightsRaw,
    appVersion,
    dryRun,
  };
};

const resolveAppVersion = (rawVersion: string | null): string => {
  if (typeof rawVersion === 'string' && rawVersion.trim().length > 0) {
    return rawVersion.trim();
  }

  const packageJsonPath: string = resolve(process.cwd(), 'package.json');
  const packageJsonRaw: string = readFileSync(packageJsonPath, 'utf8');
  const packageJsonParsed: unknown = JSON.parse(packageJsonRaw);

  if (
    typeof packageJsonParsed === 'object' &&
    packageJsonParsed !== null &&
    'version' in packageJsonParsed
  ) {
    const packageVersion: unknown = packageJsonParsed.version;

    if (typeof packageVersion === 'string' && packageVersion.trim().length > 0) {
      return packageVersion.trim();
    }
  }

  throw new Error('Cannot resolve app version from package.json');
};

const normalizeHighlightsFromFile = (filePath: string): readonly string[] => {
  const absolutePath: string = resolve(process.cwd(), filePath);
  const rawFileContent: string = readFileSync(absolutePath, 'utf8');
  const rows: readonly string[] = rawFileContent.split(/\r?\n/);
  const highlights: string[] = [];

  for (const row of rows) {
    const normalizedRow: string = row.replace(/^[-*]\s+/, '').trim();

    if (normalizedRow.length === 0 || normalizedRow.startsWith('#')) {
      continue;
    }

    highlights.push(normalizedRow);
  }

  return highlights;
};

const normalizeHighlightsFromArg = (rawHighlights: string): readonly string[] =>
  rawHighlights
    .split('|')
    .map((value: string): string => value.trim())
    .filter((value: string): boolean => value.length > 0);

const resolveHighlights = (
  notesFile: string | null,
  highlightsRaw: string | null,
): readonly string[] => {
  if (typeof notesFile === 'string' && notesFile.length > 0) {
    return normalizeHighlightsFromFile(notesFile);
  }

  if (typeof highlightsRaw === 'string' && highlightsRaw.length > 0) {
    return normalizeHighlightsFromArg(highlightsRaw);
  }

  throw new Error('Provide release notes via --notes-file or --highlights');
};

const sendReleaseNotes = async (
  chatId: string,
  botToken: string,
  message: string,
): Promise<void> => {
  const endpoint: string = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response: Response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const responseText: string = await response.text();
    throw new Error(`Telegram API error HTTP ${response.status}: ${responseText}`);
  }
};

const main = async (): Promise<void> => {
  const cliOptions: ReleaseNotesCliOptions = parseCliOptions(process.argv.slice(2));
  const appVersion: string = resolveAppVersion(cliOptions.appVersion);
  const highlights: readonly string[] = resolveHighlights(
    cliOptions.notesFile,
    cliOptions.highlightsRaw,
  );
  const deployedAtIso: string = new Date().toISOString();
  const message: string = buildReleaseNotesMessage({
    appVersion,
    deployedAtIso,
    title: cliOptions.title,
    highlights,
  });

  if (cliOptions.dryRun) {
    process.stdout.write(`${message}\n`);
    return;
  }

  if (!cliOptions.chatId) {
    throw new Error('Missing chat id. Use --chat-id or RELEASE_NOTES_CHAT_ID');
  }

  if (!cliOptions.botToken) {
    throw new Error('Missing bot token. Use --bot-token or BOT_TOKEN');
  }

  await sendReleaseNotes(cliOptions.chatId, cliOptions.botToken, message);
  process.stdout.write(
    `Release notes sent to chat ${cliOptions.chatId} for app version ${appVersion}.\n`,
  );
};

void main();
