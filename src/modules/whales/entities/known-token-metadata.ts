import type { TokenMetadata } from './token-metadata.interfaces';

const KNOWN_TOKENS: readonly TokenMetadata[] = [
  {
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    symbol: 'USDT',
    decimals: 6,
  },
  {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    decimals: 6,
  },
  {
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    symbol: 'DAI',
    decimals: 18,
  },
  {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    symbol: 'WETH',
    decimals: 18,
  },
];

export const KNOWN_TOKEN_METADATA: ReadonlyMap<string, TokenMetadata> = new Map(
  KNOWN_TOKENS.map((item: TokenMetadata): readonly [string, TokenMetadata] => [item.address, item]),
);

export const FALLBACK_TOKEN_METADATA: TokenMetadata = {
  address: '0x0000000000000000000000000000000000000000',
  symbol: 'ERC20',
  decimals: 18,
};
