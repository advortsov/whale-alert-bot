export enum GlobalDexFilterMode {
  INCLUDE = 'include',
  EXCLUDE = 'exclude',
}

export interface IGlobalFiltersCallbackPayload {
  readonly mode: GlobalDexFilterMode;
  readonly dexKey: string | null;
  readonly enabled: boolean | null;
  readonly isReset: boolean;
}
