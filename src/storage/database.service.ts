import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';

import type { Database } from './database.types';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: Kysely<Database>;

  public constructor(private readonly appConfigService: AppConfigService) {
    const pool: Pool = new Pool({
      connectionString: this.appConfigService.databaseUrl,
    });

    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  public getDb(): Kysely<Database> {
    return this.db;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await sql`select 1`.execute(this.db);
      return true;
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
