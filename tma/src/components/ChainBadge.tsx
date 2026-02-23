import React from 'react';

import { ChainIcon } from './ChainIcon';

const CHAIN_LABEL_BY_KEY: Record<string, string> = {
  ethereum_mainnet: 'Ethereum',
  solana_mainnet: 'Solana',
  tron_mainnet: 'TRON',
};

interface IChainBadgeProps {
  readonly chainKey: string;
}

export const ChainBadge = ({ chainKey }: IChainBadgeProps): React.JSX.Element => {
  const label: string = CHAIN_LABEL_BY_KEY[chainKey] ?? chainKey;

  return (
    <span className="tma-chain-badge">
      <ChainIcon chainKey={chainKey} />
      <span className="tma-chain-badge-label">{label}</span>
    </span>
  );
};
