export const applyTestEnv = (): void => {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '3000';
  process.env['LOG_LEVEL'] = 'info';
  process.env['TELEGRAM_ENABLED'] = 'false';
  process.env['CHAIN_WATCHER_ENABLED'] = 'false';
  process.env['BOT_TOKEN'] = '0000000000:TEST_TOKEN_FOR_TESTS';
  process.env['DATABASE_URL'] = 'postgres://postgres:postgres@localhost:5432/whale_alert_bot';
  process.env['ETH_ALCHEMY_WSS_URL'] = 'wss://example.invalid/alchemy';
  process.env['ETH_INFURA_WSS_URL'] = 'wss://example.invalid/infura';
  process.env['UNISWAP_SWAP_ALLOWLIST'] = '0x1111111111111111111111111111111111111111';
  process.env['ETHERSCAN_TX_BASE_URL'] = 'https://etherscan.io/tx/';
};
