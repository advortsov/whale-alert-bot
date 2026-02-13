export interface IUserTimezone {
  readonly timezone: string;
}

export interface IQuietWindow {
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
}

export interface IQuietHoursEvaluation {
  readonly suppressed: boolean;
  readonly currentMinuteOfDay: number;
}
