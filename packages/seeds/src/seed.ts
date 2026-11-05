import { NestFactory } from '@nestjs/core';
import { SeedDataService } from './seed.service';
import { SeedAppModule } from './seed.module';

// cspell:ignore upsert upserts upserted
/**
 * Seed CLI (`yarn seed`). What it writes depends on the database it is pointed at — there is no
 * environment check:
 * - no employees: the database is RESET (all tables emptied) and filled with the sample employees
 *   and search criteria (no tenant is created: the sample data is tenant-less);
 * - employees but no search criteria: `seedData` runs again, which inserts or updates ("upsert") the sample employees by
 *   name (an employee with a matching name gets the sample profile fields) and the sample criteria;
 * - employees and criteria: nothing is written.
 */
(async () => {
  const app = await NestFactory.create(SeedAppModule);
  await app.init();

  const seedDataService = app.get(SeedDataService);
  await seedDataService.run(true);

  app.close();

  process.exit(0);
})();
