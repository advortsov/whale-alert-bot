import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { post } from './api-client';

interface ITelegramLoginPayload {
  readonly id: number;
  readonly first_name: string;
  readonly username: string;
  readonly auth_date: number;
  readonly hash: string;
}

interface IAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

function loadBotToken(): string {
  const fromEnv: string | undefined = process.env['BOT_TOKEN'];
  if (fromEnv) {
    return fromEnv;
  }

  const envFilePath: string = resolve(process.cwd(), '.env.dev.local');
  const content: string = readFileSync(envFilePath, 'utf-8');
  const match: RegExpExecArray | null = /^BOT_TOKEN=(.+)$/m.exec(content);
  if (!match?.[1]) {
    throw new Error('BOT_TOKEN not found in env or .env.dev.local');
  }

  return match[1].trim();
}

const SCENARIO_TELEGRAM_ID = 99999;

export function buildTelegramLoginPayload(
  botToken: string,
  overrides?: Partial<Omit<ITelegramLoginPayload, 'hash'>>,
): ITelegramLoginPayload {
  const data: Record<string, string | number> = {
    id: overrides?.id ?? SCENARIO_TELEGRAM_ID,
    first_name: overrides?.first_name ?? 'ScenarioUser',
    username: overrides?.username ?? 'scenario_test_user',
    auth_date: overrides?.auth_date ?? Math.floor(Date.now() / 1000),
  };

  const dataCheckString: string = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey: Buffer = createHash('sha256').update(botToken).digest();
  const hash: string = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return { ...(data as Omit<ITelegramLoginPayload, 'hash'>), hash };
}

export async function loginAndGetTokens(): Promise<IAuthTokens> {
  const botToken: string = loadBotToken();
  const payload: ITelegramLoginPayload = buildTelegramLoginPayload(botToken);
  const result = await post<IAuthTokens>('/api/auth/telegram', payload);

  if (result.status !== 200) {
    throw new Error(`Login failed with status ${String(result.status)}`);
  }

  return result.body;
}

export function getBotToken(): string {
  return loadBotToken();
}
