import { createPostgrator } from './postgrator';

const run = async (): Promise<void> => {
  const { runner, close } = createPostgrator();

  try {
    const maxVersion: number = await runner.getMaxVersion();
    const migrations = await runner.migrate(String(maxVersion));
    process.stdout.write(
      `Applied migrations: ${migrations.length}. Current version: ${maxVersion}.\n`,
    );
  } finally {
    await close();
  }
};

void run();
