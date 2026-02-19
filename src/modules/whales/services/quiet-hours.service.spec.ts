import { describe, expect, it } from 'vitest';

import { QuietHoursService } from './quiet-hours.service';

describe('QuietHoursService', (): void => {
  it('suppresses when current time is inside same-day interval', (): void => {
    const service: QuietHoursService = new QuietHoursService();
    const result = service.evaluate('10:00', '12:00', 'UTC', new Date('2026-02-10T10:30:00.000Z'));

    expect(result.suppressed).toBe(true);
  });

  it('suppresses when interval crosses midnight', (): void => {
    const service: QuietHoursService = new QuietHoursService();
    const result = service.evaluate('23:00', '07:00', 'UTC', new Date('2026-02-10T01:30:00.000Z'));

    expect(result.suppressed).toBe(true);
  });

  it('does not suppress when outside interval', (): void => {
    const service: QuietHoursService = new QuietHoursService();
    const result = service.evaluate('23:00', '07:00', 'UTC', new Date('2026-02-10T14:30:00.000Z'));

    expect(result.suppressed).toBe(false);
  });
});
