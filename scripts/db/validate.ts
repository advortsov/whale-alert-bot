import { createPostgrator } from './postgrator';

const run = async (): Promise<void> => {
  const { runner, close } = createPostgrator();

  try {
    const databaseVersion: number = await runner.getDatabaseVersion();
    await runner.validateMigrations(databaseVersion);
    process.stdout.write(`Postgrator validation passed at version ${databaseVersion}.\n`);
  } finally {
    await close();
  }
};

void run();
