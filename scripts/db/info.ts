import { createPostgrator } from './postgrator';

const run = async (): Promise<void> => {
  const { runner, close } = createPostgrator();

  try {
    const databaseVersion: number = await runner.getDatabaseVersion();
    const maxVersion: number = await runner.getMaxVersion();

    process.stdout.write(
      `Database version: ${databaseVersion}. Max migration version: ${maxVersion}.\n`,
    );
  } finally {
    await close();
  }
};

void run();
