export type TelegramUserRef = {
  readonly telegramId: string;
  readonly username: string | null;
};

export type TrackedWalletOption = {
  readonly walletId: number;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
};
