import { NestFactory } from '@nestjs/core';
import { SeedDataService } from './seed.service';
import { SeedAppModule } from './seed.module';

// cspell:ignore upsert upserts upserted
/**
 * Seed update CLI (`yarn seed:update`). There is no environment check:
 * - no employees: the database is RESET (all tables emptied) and filled with the sample data;
 * - otherwise `seedData` runs unconditionally and OVERWRITES: the sample employees are inserted or updated ("upsert") by
 *   name (a matching employee gets the sample profile fields) and the sample search criteria are
 *   inserted or updated too (`insertJobSearchCriteria` reuses an existing row's id and saves the sample fields,
 *   so `isRemote`, `hoursOld`, … of matching criteria are replaced). A sample-data refresh, not a
 *   criteria-only backfill.
 */
(async () => {
  const app = await NestFactory.create(SeedAppModule);
  await app.init();

  const seedDataService = app.get(SeedDataService);
  await seedDataService.runUpdate(true);

  app.close();

  process.exit(0);
})();
