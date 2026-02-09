import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { applyTestEnv } from './helpers/test-env';

describe('Health (e2e)', (): void => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async (): Promise<void> => {
    applyTestEnv();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    type HttpServerWithAddress = {
      address: () => {
        port: number;
      };
    };

    const httpServer: HttpServerWithAddress = app.getHttpServer() as HttpServerWithAddress;
    const serverAddress: { port: number } = httpServer.address();
    baseUrl = `http://127.0.0.1:${serverAddress.port.toString()}`;
  });

  afterAll(async (): Promise<void> => {
    await app.close().catch((): void => undefined);
  });

  it('/health (GET) should return status', async (): Promise<void> => {
    const response = await fetch(`${baseUrl}/health`);
    const responseJson: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson).toHaveProperty('status');
  });
});
