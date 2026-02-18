import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../kysely/database.service';
import type { NewUserRow, UserRow } from '../types/database.types';

@Injectable()
export class UsersRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByTelegramId(telegramId: string): Promise<UserRow | null> {
    const user: UserRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('users')
      .selectAll()
      .where('telegram_id', '=', telegramId)
      .executeTakeFirst();

    return user ?? null;
  }

  public async create(input: NewUserRow): Promise<UserRow> {
    return this.databaseService
      .getDb()
      .insertInto('users')
      .values(input)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async findOrCreate(telegramId: string, username: string | null): Promise<UserRow> {
    const insertedUser: UserRow | undefined = await this.databaseService
      .getDb()
      .insertInto('users')
      .values({
        telegram_id: telegramId,
        username,
      })
      .onConflict((oc) => oc.column('telegram_id').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedUser) {
      return insertedUser;
    }

    const existingUser: UserRow | null = await this.findByTelegramId(telegramId);

    if (!existingUser) {
      throw new Error(`User ${telegramId} was not found after upsert attempt.`);
    }

    if (username !== null && existingUser.username !== username) {
      const updatedUser: UserRow = await this.databaseService
        .getDb()
        .updateTable('users')
        .set({ username })
        .where('id', '=', existingUser.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return updatedUser;
    }

    return existingUser;
  }
}
