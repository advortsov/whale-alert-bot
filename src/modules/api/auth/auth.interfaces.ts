export interface ITelegramLoginData {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string | undefined;
  readonly username?: string | undefined;
  readonly photo_url?: string | undefined;
  readonly auth_date: number;
  readonly hash: string;
}

export interface IJwtPayload {
  readonly sub: string;
  readonly username: string | null;
  readonly type: 'access' | 'refresh';
}

export interface IAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}
