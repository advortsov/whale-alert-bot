import React from 'react';

const CHAIN_ICON_BY_KEY: Record<string, string> = {
  ethereum_mainnet: 'Ξ',
  solana_mainnet: '◎',
  tron_mainnet: '◉',
};

interface IChainIconProps {
  readonly chainKey: string;
}

export const ChainIcon = ({ chainKey }: IChainIconProps): React.JSX.Element => {
  const icon: string = CHAIN_ICON_BY_KEY[chainKey] ?? '◌';
  return <span aria-label={chainKey}>{icon}</span>;
};
