import { describe, expect, it } from 'vitest';

import { buildReleaseNotesMessage } from './release-notes-message.builder';

describe('buildReleaseNotesMessage', (): void => {
  it('builds release notes message with version and numbered highlights', (): void => {
    const message: string = buildReleaseNotesMessage({
      appVersion: '1.4.2',
      deployedAtIso: '2026-02-10T13:00:00.000Z',
      title: 'Что нового:',
      highlights: ['Fix Solana /track multiline', 'Add release notes publisher'],
    });

    expect(message).toContain('Release v1.4.2');
    expect(message).toContain('1. Fix Solana /track multiline');
    expect(message).toContain('2. Add release notes publisher');
  });

  it('builds message with fallback line when highlights are empty', (): void => {
    const message: string = buildReleaseNotesMessage({
      appVersion: '1.4.3',
      deployedAtIso: '2026-02-10T14:00:00.000Z',
      title: 'Что нового:',
      highlights: [],
    });

    expect(message).toContain('Release v1.4.3');
    expect(message).toContain('1. Изменений для публикации нет.');
  });
});
