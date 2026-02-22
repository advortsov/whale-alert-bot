import { type LogLevel, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
  const corsOrigins: (string | RegExp)[] = [
    /^https:\/\/.*\.telegram\.org$/,
    'https://1303118-cr22992.tw1.ru',
    ...appConfigService.tmaAllowedOrigins,
  ];

  if (appConfigService.nodeEnv !== 'production') {
    corsOrigins.push('http://localhost:5173');
  }

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  logger.log(`Resolved log level: ${appConfigService.logLevel}`);
  logger.log(
    `Runtime config: nodeEnv=${appConfigService.nodeEnv}, telegramEnabled=${String(appConfigService.telegramEnabled)}, chainWatcherEnabled=${String(appConfigService.chainWatcherEnabled)}`,
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Whale Alert Bot API')
    .setDescription('REST API for crypto wallet monitoring')
    .setVersion(appConfigService.appVersion)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(appConfigService.port);
  logger.log(`Whale Alert Bot is listening on port ${appConfigService.port}.`);
};

void bootstrap();
