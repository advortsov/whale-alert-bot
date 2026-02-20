import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// -- Auth --

export const AUTH_TOKENS_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
    refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
  },
  required: ['accessToken', 'refreshToken'],
};

export const TELEGRAM_LOGIN_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 123456789 },
    first_name: { type: 'string', example: 'John' },
    last_name: { type: 'string', example: 'Doe' },
    username: { type: 'string', example: 'johndoe' },
    photo_url: { type: 'string', example: 'https://t.me/i/userpic/...' },
    auth_date: { type: 'integer', example: 1700000000 },
    hash: { type: 'string', example: 'abc123...' },
  },
  required: ['id', 'first_name', 'auth_date', 'hash'],
};

export const REFRESH_TOKEN_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    refreshToken: { type: 'string' },
  },
  required: ['refreshToken'],
};

// -- Wallets --

export const TRACK_WALLET_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    chainKey: { type: 'string', enum: ['ethereum_mainnet', 'solana_mainnet', 'tron_mainnet'] },
    address: { type: 'string', example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
    label: { type: 'string', nullable: true, example: 'Vitalik', maxLength: 50 },
  },
  required: ['chainKey', 'address'],
};

export const TRACK_WALLET_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    address: { type: 'string' },
    label: { type: 'string', nullable: true },
    chainKey: { type: 'string' },
    isNewSubscription: { type: 'boolean' },
  },
  required: ['walletId', 'address', 'label', 'chainKey', 'isNewSubscription'],
};

const WALLET_SUMMARY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    address: { type: 'string' },
    label: { type: 'string', nullable: true },
    chainKey: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const WALLET_LIST_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    wallets: { type: 'array', items: WALLET_SUMMARY_SCHEMA },
    totalCount: { type: 'integer' },
  },
  required: ['wallets', 'totalCount'],
};

const WALLET_PREFERENCES_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    allowTransfer: { type: 'boolean' },
    allowSwap: { type: 'boolean' },
    hasOverride: { type: 'boolean' },
  },
};

const USER_ALERT_PREFERENCES_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    minAmount: { type: 'number' },
    allowTransfer: { type: 'boolean' },
    allowSwap: { type: 'boolean' },
    mutedUntil: { type: 'string', format: 'date-time', nullable: true },
  },
};

const USER_ALERT_SETTINGS_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    thresholdUsd: { type: 'number' },
    minAmountUsd: { type: 'number' },
    cexFlowMode: { type: 'string', enum: ['off', 'in', 'out', 'all'] },
    smartFilterType: { type: 'string', enum: ['all', 'buy', 'sell', 'transfer'] },
    includeDexes: { type: 'array', items: { type: 'string' } },
    excludeDexes: { type: 'array', items: { type: 'string' } },
    quietHoursFrom: { type: 'string', nullable: true },
    quietHoursTo: { type: 'string', nullable: true },
    timezone: { type: 'string' },
  },
};

const WALLET_EVENT_HISTORY_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    chainId: { type: 'integer' },
    chainKey: { type: 'string' },
    txHash: { type: 'string' },
    logIndex: { type: 'integer' },
    trackedAddress: { type: 'string' },
    eventType: { type: 'string' },
    direction: { type: 'string' },
    assetStandard: { type: 'string' },
    contractAddress: { type: 'string', nullable: true },
    tokenAddress: { type: 'string', nullable: true },
    tokenSymbol: { type: 'string', nullable: true },
    tokenDecimals: { type: 'integer', nullable: true },
    tokenAmountRaw: { type: 'string', nullable: true },
    valueFormatted: { type: 'string', nullable: true },
    dex: { type: 'string', nullable: true },
    pair: { type: 'string', nullable: true },
    occurredAt: { type: 'string', format: 'date-time' },
  },
};

export const WALLET_DETAIL_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    address: { type: 'string' },
    label: { type: 'string', nullable: true },
    chainKey: { type: 'string' },
    globalPreferences: USER_ALERT_PREFERENCES_SCHEMA,
    walletPreferences: { ...WALLET_PREFERENCES_SCHEMA, nullable: true },
    settings: USER_ALERT_SETTINGS_SCHEMA,
    activeMute: { type: 'string', format: 'date-time', nullable: true },
    recentEvents: { type: 'array', items: WALLET_EVENT_HISTORY_VIEW_SCHEMA },
  },
};

export const UNTRACK_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    address: { type: 'string' },
    chainKey: { type: 'string' },
  },
  required: ['walletId', 'address', 'chainKey'],
};

export const MUTE_WALLET_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    minutes: { type: 'integer', minimum: 1, maximum: 10_080, example: 60 },
  },
  required: ['minutes'],
};

export const MUTE_WALLET_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    mutedUntil: { type: 'string', format: 'date-time' },
  },
  required: ['walletId', 'mutedUntil'],
};

export const WALLET_ALERT_FILTER_STATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    walletId: { type: 'integer' },
    walletAddress: { type: 'string' },
    walletLabel: { type: 'string', nullable: true },
    chainKey: { type: 'string' },
    allowTransfer: { type: 'boolean' },
    allowSwap: { type: 'boolean' },
    hasWalletOverride: { type: 'boolean' },
  },
};

export const WALLET_FILTER_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    target: { type: 'string', enum: ['transfer', 'swap'] },
    enabled: { type: 'boolean' },
  },
  required: ['target', 'enabled'],
};

export const HISTORY_PAGE_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    resolvedAddress: { type: 'string' },
    walletId: { type: 'integer', nullable: true },
    limit: { type: 'integer' },
    offset: { type: 'integer' },
    kind: { type: 'string', enum: ['all', 'eth', 'erc20'] },
    direction: { type: 'string', enum: ['all', 'in', 'out'] },
    hasNextPage: { type: 'boolean' },
  },
};

// -- Settings --

export const UPDATE_SETTINGS_BODY_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    thresholdUsd: { type: 'number', minimum: 0 },
    mutedMinutes: { type: 'integer', nullable: true, minimum: 0 },
    cexFlowMode: { type: 'string', enum: ['off', 'in', 'out', 'all'] },
    smartFilterType: { type: 'string', enum: ['all', 'buy', 'sell', 'transfer'] },
    includeDexes: { type: 'array', items: { type: 'string' } },
    excludeDexes: { type: 'array', items: { type: 'string' } },
    quietHoursFrom: { type: 'string', nullable: true },
    quietHoursTo: { type: 'string', nullable: true },
    timezone: { type: 'string' },
    allowTransfer: { type: 'boolean' },
    allowSwap: { type: 'boolean' },
  },
};

export const USER_SETTINGS_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    preferences: USER_ALERT_PREFERENCES_SCHEMA,
    settings: USER_ALERT_SETTINGS_SCHEMA,
  },
  required: ['preferences', 'settings'],
};

// -- Status --

export const USER_STATUS_RESULT_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    preferences: USER_ALERT_PREFERENCES_SCHEMA,
    settings: USER_ALERT_SETTINGS_SCHEMA,
    historyQuota: {
      type: 'object',
      properties: {
        minuteUsed: { type: 'integer' },
        minuteLimit: { type: 'integer' },
        minuteRemaining: { type: 'integer' },
      },
      required: ['minuteUsed', 'minuteLimit', 'minuteRemaining'],
    },
  },
  required: ['preferences', 'settings', 'historyQuota'],
};
