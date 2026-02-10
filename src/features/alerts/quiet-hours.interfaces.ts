export interface UserTimezone {
  readonly timezone: string;
}

export interface QuietWindow {
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
}

export interface QuietHoursEvaluation {
  readonly suppressed: boolean;
  readonly currentMinuteOfDay: number;
}
