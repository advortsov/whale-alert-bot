import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { loadSettings, updateSettings } from '../api/settings';
import { FilterToggle } from '../components/FilterToggle';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import type { IUpdateSettingsRequest, IUserSettingsResult } from '../types/api.types';

export const SettingsPage = (): React.JSX.Element => {
  const { apiClient, isReady } = useAuth();
  const settingsQuery = useQuery<IUserSettingsResult>({
    queryKey: ['settings'],
    queryFn: async (): Promise<IUserSettingsResult> => {
      return loadSettings(apiClient);
    },
    enabled: isReady,
  });

  const [formState, setFormState] = useState<IUpdateSettingsRequest | null>(null);

  useEffect((): void => {
    if (settingsQuery.data === undefined) {
      return;
    }

    setFormState({
      thresholdUsd: settingsQuery.data.thresholdUsd,
      minAmountUsd: settingsQuery.data.minAmountUsd,
      quietHoursFrom: settingsQuery.data.quietHoursFrom,
      quietHoursTo: settingsQuery.data.quietHoursTo,
      timezone: settingsQuery.data.timezone,
      cexFlowMode: settingsQuery.data.cexFlowMode,
      transferEnabled: settingsQuery.data.transferEnabled,
      swapEnabled: settingsQuery.data.swapEnabled,
    });
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: IUpdateSettingsRequest): Promise<IUserSettingsResult> => {
      return updateSettings(apiClient, payload);
    },
  });

  if (settingsQuery.isLoading || formState === null) {
    return <LoadingSpinner />;
  }

  if (settingsQuery.isError) {
    return <p>Не удалось загрузить настройки.</p>;
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Настройки</h1>

      <label>
        Threshold USD
        <input
          type="number"
          value={formState.thresholdUsd ?? ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            const parsed: number = Number.parseFloat(event.target.value);
            setFormState({
              ...formState,
              thresholdUsd: Number.isFinite(parsed) ? parsed : null,
            });
          }}
        />
      </label>

      <FilterToggle
        label="Transfer alerts"
        value={formState.transferEnabled}
        onChange={(nextValue: boolean): void => {
          setFormState({ ...formState, transferEnabled: nextValue });
        }}
      />
      <FilterToggle
        label="Swap alerts"
        value={formState.swapEnabled}
        onChange={(nextValue: boolean): void => {
          setFormState({ ...formState, swapEnabled: nextValue });
        }}
      />

      <button
        type="button"
        onClick={(): void => {
          void updateMutation.mutateAsync(formState);
        }}
      >
        Сохранить
      </button>
      {updateMutation.isError ? <p>Ошибка сохранения.</p> : null}
      {updateMutation.isSuccess ? <p>Сохранено.</p> : null}
    </section>
  );
};
