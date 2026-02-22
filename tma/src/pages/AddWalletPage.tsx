import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { addWallet } from '../api/wallets';
import { useAuth } from '../hooks/useAuth';
import type { ITrackWalletRequest, IWalletItem } from '../types/api.types';

const DEFAULT_CHAIN_KEY: string = 'ethereum_mainnet';

export const AddWalletPage = (): React.JSX.Element => {
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [chainKey, setChainKey] = useState<string>(DEFAULT_CHAIN_KEY);
  const [address, setAddress] = useState<string>('');
  const [label, setLabel] = useState<string>('');

  const addWalletMutation = useMutation({
    mutationFn: async (payload: ITrackWalletRequest): Promise<IWalletItem> => {
      return addWallet(apiClient, payload);
    },
    onSuccess: (wallet: IWalletItem): void => {
      void navigate(`/wallets/${wallet.id}`);
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const payload: ITrackWalletRequest = {
      chainKey,
      address,
      label,
    };

    void addWalletMutation.mutateAsync(payload);
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Добавить кошелёк</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
        <label>
          Chain
          <select value={chainKey} onChange={(event): void => setChainKey(event.target.value)}>
            <option value="ethereum_mainnet">ETH</option>
            <option value="solana_mainnet">SOL</option>
            <option value="tron_mainnet">TRON</option>
          </select>
        </label>
        <label>
          Address
          <input value={address} onChange={(event): void => setAddress(event.target.value)} />
        </label>
        <label>
          Label
          <input value={label} onChange={(event): void => setLabel(event.target.value)} />
        </label>
        <button type="submit">Добавить</button>
      </form>
      {addWalletMutation.isError ? <p>Не удалось добавить кошелек.</p> : null}
    </section>
  );
};
