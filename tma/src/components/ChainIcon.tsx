import React from 'react';

const CHAIN_ICON_BY_KEY: Record<string, string> = {
  ethereum_mainnet: 'Ξ',
  solana_mainnet: '◎',
  tron_mainnet: '◉',
};

const CHAIN_CLASS_BY_KEY: Record<string, string> = {
  ethereum_mainnet: 'tma-chain-icon--eth',
  solana_mainnet: 'tma-chain-icon--sol',
  tron_mainnet: 'tma-chain-icon--tron',
};

interface IChainIconProps {
  readonly chainKey: string;
}

export const ChainIcon = ({ chainKey }: IChainIconProps): React.JSX.Element => {
  const icon: string = CHAIN_ICON_BY_KEY[chainKey] ?? '◌';
  const chainClassName: string = CHAIN_CLASS_BY_KEY[chainKey] ?? 'tma-chain-icon--default';
  return (
    <span aria-label={chainKey} className={`tma-chain-icon ${chainClassName}`}>
      {icon}
    </span>
  );
};
