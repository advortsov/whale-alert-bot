import type { ReleaseNotesMessageInput } from './release-notes.interfaces';

const normalizeHighlights = (highlights: readonly string[]): readonly string[] =>
  highlights
    .map((highlight: string): string => highlight.trim())
    .filter((highlight: string): boolean => highlight.length > 0);

export const buildReleaseNotesMessage = (input: ReleaseNotesMessageInput): string => {
  const normalizedVersion: string = input.appVersion.trim();
  const normalizedTitle: string = input.title.trim();
  const normalizedHighlights: readonly string[] = normalizeHighlights(input.highlights);
  const lines: string[] = [
    `📦 Release v${normalizedVersion}`,
    `🕒 ${input.deployedAtIso}`,
    '',
    normalizedTitle,
  ];

  if (normalizedHighlights.length === 0) {
    lines.push('1. Изменений для публикации нет.');
  } else {
    for (let index: number = 0; index < normalizedHighlights.length; index += 1) {
      const highlight: string | undefined = normalizedHighlights[index];

      if (typeof highlight === 'string') {
        lines.push(`${index + 1}. ${highlight}`);
      }
    }
  }

  return lines.join('\n');
};
