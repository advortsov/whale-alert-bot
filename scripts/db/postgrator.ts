import path from 'node:path';
import { Pool, type QueryResultRow } from 'pg';
import Postgrator from 'postgrator';

type ExecQueryResult = {
  rows: QueryResultRow[];
};

type PostgratorContext = {
  readonly runner: Postgrator;
  readonly close: () => Promise<void>;
};

const MIGRATION_PATTERN: string = path.resolve(process.cwd(), 'database/migrations/*.sql');
const SCHEMA_TABLE: string = 'schemaversion';

const getDatabaseUrl = (): string => {
  const databaseUrl: string | undefined = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for migrations.');
  }

  return databaseUrl;
};

export const createPostgrator = (): PostgratorContext => {
  const pool: Pool = new Pool({
    connectionString: getDatabaseUrl(),
  });

  const runner: Postgrator = new Postgrator({
    driver: 'pg',
    migrationPattern: MIGRATION_PATTERN,
    schemaTable: SCHEMA_TABLE,
    validateChecksums: true,
    currentSchema: 'public',
    execQuery: async (query: string): Promise<ExecQueryResult> => {
      const result = await pool.query(query);
      return {
        rows: result.rows as QueryResultRow[],
      };
    },
    execSqlScript: async (sqlScript: string): Promise<void> => {
      await pool.query(sqlScript);
    },
  });

  return {
    runner,
    close: async (): Promise<void> => {
      await pool.end();
    },
  };
};
