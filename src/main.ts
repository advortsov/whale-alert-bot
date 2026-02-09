import { type LogLevel, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

const resolveNestLogLevels = (logLevel: string): LogLevel[] => {
  if (logLevel === 'debug') {
    return ['error', 'warn', 'log', 'debug'];
  }

  if (logLevel === 'info') {
    return ['error', 'warn', 'log'];
  }

  if (logLevel === 'warn') {
    return ['error', 'warn'];
  }

  return ['error'];
};

const bootstrap = async (): Promise<void> => {
  const configuredLogLevel: string = process.env['LOG_LEVEL'] ?? 'info';
  const app = await NestFactory.create(AppModule, {
    logger: resolveNestLogLevels(configuredLogLevel),
  });
  const appConfigService: AppConfigService = app.get(AppConfigService);
  const logger: Logger = new Logger('Bootstrap');

  logger.log(`Resolved log level: ${appConfigService.logLevel}`);
  logger.log(
    `Runtime config: nodeEnv=${appConfigService.nodeEnv}, telegramEnabled=${String(appConfigService.telegramEnabled)}, chainWatcherEnabled=${String(appConfigService.chainWatcherEnabled)}`,
  );
  await app.listen(appConfigService.port);
  logger.log(`Whale Alert Bot is listening on port ${appConfigService.port}.`);
};

void bootstrap();
