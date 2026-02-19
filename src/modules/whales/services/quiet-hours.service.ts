import { Injectable } from '@nestjs/common';

import type { IQuietHoursEvaluation } from '../entities/quiet-hours.interfaces';

const MAX_HOUR = 23;
const MAX_MINUTE = 59;

@Injectable()
export class QuietHoursService {
  public evaluate(
    quietFrom: string | null,
    quietTo: string | null,
    timezone: string,
    now: Date = new Date(),
  ): IQuietHoursEvaluation {
    if (quietFrom === null || quietTo === null) {
      return {
        suppressed: false,
        currentMinuteOfDay: this.resolveMinuteOfDay(now, timezone),
      };
    }

    const startMinute: number | null = this.parseMinuteOfDay(quietFrom);
    const endMinute: number | null = this.parseMinuteOfDay(quietTo);
    const currentMinuteOfDay: number = this.resolveMinuteOfDay(now, timezone);

    if (startMinute === null || endMinute === null) {
      return {
        suppressed: false,
        currentMinuteOfDay,
      };
    }

    if (startMinute === endMinute) {
      return {
        suppressed: true,
        currentMinuteOfDay,
      };
    }

    if (startMinute < endMinute) {
      return {
        suppressed: currentMinuteOfDay >= startMinute && currentMinuteOfDay < endMinute,
        currentMinuteOfDay,
      };
    }

    return {
      suppressed: currentMinuteOfDay >= startMinute || currentMinuteOfDay < endMinute,
      currentMinuteOfDay,
    };
  }

  public parseMinuteOfDay(timeValue: string): number | null {
    const normalizedValue: string = timeValue.trim();

    if (!/^\d{2}:\d{2}$/.test(normalizedValue)) {
      return null;
    }

    const [hourPart, minutePart] = normalizedValue.split(':');
    const hour: number = Number.parseInt(hourPart ?? '', 10);
    const minute: number = Number.parseInt(minutePart ?? '', 10);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }

    if (hour < 0 || hour > MAX_HOUR || minute < 0 || minute > MAX_MINUTE) {
      return null;
    }

    return hour * 60 + minute;
  }

  private resolveMinuteOfDay(now: Date, timezone: string): number {
    const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    const formatted: string = formatter.format(now);
    const [hourPart, minutePart] = formatted.split(':');
    const hour: number = Number.parseInt(hourPart ?? '0', 10);
    const minute: number = Number.parseInt(minutePart ?? '0', 10);

    return hour * 60 + minute;
  }
}
