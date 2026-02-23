import React from 'react';

import ethereumIcon from '../assets/chains/ethereum.svg';
import solanaIcon from '../assets/chains/solana.svg';
import tronIcon from '../assets/chains/tron.svg';

const CHAIN_ICON_SRC_BY_KEY: Record<string, string> = {
  ethereum_mainnet: ethereumIcon,
  solana_mainnet: solanaIcon,
  tron_mainnet: tronIcon,
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
  const iconSrc: string | undefined = CHAIN_ICON_SRC_BY_KEY[chainKey];
  const chainClassName: string = CHAIN_CLASS_BY_KEY[chainKey] ?? 'tma-chain-icon--default';

  if (iconSrc !== undefined) {
    return (
      <img
        alt={chainKey}
        aria-label={chainKey}
        className={`tma-chain-icon ${chainClassName}`}
        src={iconSrc}
        loading="lazy"
      />
    );
  }

  return (
    <span aria-label={chainKey} className={`tma-chain-icon ${chainClassName}`}>
      ?
    </span>
  );
};
