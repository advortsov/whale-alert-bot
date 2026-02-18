import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';

import type { IDatabase } from '../types/database.types';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: Kysely<IDatabase>;
  private readonly pool: Pool;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.pool = new Pool({
      connectionString: this.appConfigService.databaseUrl,
    });

    this.db = new Kysely<IDatabase>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
  }

  public getDb(): Kysely<IDatabase> {
    return this.db;
  }

  public getPool(): Pool {
    return this.pool;
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
