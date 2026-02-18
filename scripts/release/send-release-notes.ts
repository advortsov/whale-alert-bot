import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReleaseNotesMessage } from '../../src/common/utils/release/release-notes-message.builder';

type ReleaseNotesCliOptions = {
  readonly chatId: string | null;
  readonly botToken: string | null;
  readonly title: string;
  readonly notesFile: string | null;
  readonly highlightsRaw: string | null;
  readonly appVersion: string | null;
  readonly dryRun: boolean;
};

type ReleaseNotesOptionState = {
  chatId: string | null;
  botToken: string | null;
  title: string;
  notesFile: string | null;
  highlightsRaw: string | null;
  appVersion: string | null;
  dryRun: boolean;
};

const isOptionWithValue = (arg: string): boolean =>
  arg === '--chat-id' ||
  arg === '--bot-token' ||
  arg === '--title' ||
  arg === '--notes-file' ||
  arg === '--highlights' ||
  arg === '--version';

const applyOptionWithValue = (state: ReleaseNotesOptionState, arg: string, value: string): void => {
  if (arg === '--chat-id') {
    state.chatId = value.trim();
    return;
  }

  if (arg === '--bot-token') {
    state.botToken = value.trim();
    return;
  }

  if (arg === '--title') {
    state.title = value.trim();
    return;
  }

  if (arg === '--notes-file') {
    state.notesFile = value.trim();
    return;
  }

  if (arg === '--highlights') {
    state.highlightsRaw = value.trim();
    return;
  }

  if (arg === '--version') {
    state.appVersion = value.trim();
  }
};

type ParsedCliStep = {
  readonly nextIndex: number;
  readonly dryRun: boolean;
};

const parseSingleCliArgument = (
  argv: readonly string[],
  index: number,
  state: ReleaseNotesOptionState,
): ParsedCliStep => {
  const arg: string | undefined = argv[index];

  if (typeof arg !== 'string') {
    return {
      nextIndex: index + 1,
      dryRun: state.dryRun,
    };
  }

  if (arg === '--dry-run') {
    return {
      nextIndex: index + 1,
      dryRun: true,
    };
  }

  if (!isOptionWithValue(arg)) {
    return {
      nextIndex: index + 1,
      dryRun: state.dryRun,
    };
  }

  const value: string | undefined = argv[index + 1];

  if (typeof value !== 'string') {
    throw new Error(`Missing value for argument ${arg}`);
  }

  applyOptionWithValue(state, arg, value);
  return {
    nextIndex: index + 2,
    dryRun: state.dryRun,
  };
};

const parseCliOptions = (argv: readonly string[]): ReleaseNotesCliOptions => {
  const state: ReleaseNotesOptionState = {
    chatId: process.env['RELEASE_NOTES_CHAT_ID']?.trim() ?? null,
    botToken: process.env['BOT_TOKEN']?.trim() ?? null,
    title: 'Что нового:',
    notesFile: null,
    highlightsRaw: null,
    appVersion: process.env['APP_VERSION']?.trim() ?? null,
    dryRun: false,
  };

  for (let index: number = 0; index < argv.length; ) {
    const parsedStep: ParsedCliStep = parseSingleCliArgument(argv, index, state);
    state.dryRun = parsedStep.dryRun;
    index = parsedStep.nextIndex;
  }

  return {
    chatId: state.chatId,
    botToken: state.botToken,
    title: state.title,
    notesFile: state.notesFile,
    highlightsRaw: state.highlightsRaw,
    appVersion: state.appVersion,
    dryRun: state.dryRun,
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
