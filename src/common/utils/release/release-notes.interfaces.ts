export type ReleaseNotesMessageInput = {
  readonly appVersion: string;
  readonly deployedAtIso: string;
  readonly title: string;
  readonly highlights: readonly string[];
};
