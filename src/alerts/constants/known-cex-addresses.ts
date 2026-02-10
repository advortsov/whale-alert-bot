import { ChainKey } from '../../core/chains/chain-key.interfaces';

export interface KnownCexAddressEntry {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly tag: string;
}

export const KNOWN_CEX_ADDRESS_BOOK: readonly KnownCexAddressEntry[] = [
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0x28c6c06298d514db089934071355e5743bf21d60',
    tag: 'binance',
  },
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    tag: 'binance',
  },
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0xda9dfa130df4de4673b89022ee50ff26f6ea73cf',
    tag: 'coinbase',
  },
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec',
    tag: 'huobi',
  },
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0x503828976d22510aad0201ac7ec88293211d23da',
    tag: 'robinhood',
  },
  {
    chainKey: ChainKey.ETHEREUM_MAINNET,
    address: '0xc0996c819f6e0dfc0ac8237e5f5df325c5fd5d87',
    tag: 'gemini',
  },
];
