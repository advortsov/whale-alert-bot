import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { Pool, type QueryResultRow } from 'pg';
import Postgrator from 'postgrator';

import { AppConfigService } from '../config/app-config.service';

type ExecQueryResult = {
  rows: QueryResultRow[];
};

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger: Logger = new Logger(MigrationService.name);

  public constructor(private readonly appConfigService: AppConfigService) {}

  public async onModuleInit(): Promise<void> {
    const pool: Pool = new Pool({
      connectionString: this.appConfigService.databaseUrl,
    });

    try {
      const migrationPattern: string = resolve(process.cwd(), 'database/migrations/*.sql');

      const runner: Postgrator = new Postgrator({
        driver: 'pg',
        migrationPattern,
        schemaTable: 'schemaversion',
        validateChecksums: true,
        currentSchema: 'public',
        execQuery: async (query: string): Promise<ExecQueryResult> => {
          const result = await pool.query(query);
          return { rows: result.rows as QueryResultRow[] };
        },
        execSqlScript: async (sqlScript: string): Promise<void> => {
          await pool.query(sqlScript);
        },
      });

      const maxVersion: number = await runner.getMaxVersion();
      const migrations = await runner.migrate(String(maxVersion));

      if (migrations.length > 0) {
        this.logger.log(`Applied ${migrations.length} migration(s), now at version ${maxVersion}`);
      } else {
        this.logger.log(`IDatabase schema is up to date at version ${maxVersion}`);
      }
    } finally {
      await pool.end();
    }
  }
}
