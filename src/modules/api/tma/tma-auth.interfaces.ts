export interface ITmaUserPayload {
  readonly id: number;
  readonly username?: string;
}

export interface IVerifiedTmaUser {
  readonly telegramId: string;
  readonly username: string | null;
}
