import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { SeedDataService } from '@packages/seeds/seed.service';
import { CrawlerService } from '@packages/crawler/crawler.service';
import { ConfigurationService } from '@packages/config';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  constructor(
    private readonly seedDataService: SeedDataService,
    private readonly crawlerService: CrawlerService,
	private readonly configService: ConfigurationService,
  ) {}

  async ping(): Promise<void> {
	console.log('AppService ping');
  }

  async onApplicationBootstrap(): Promise<void> {
    // Seed DB with default data, if it's empty
    await this.seedDataService.run(true);

    // We do one time crawl on app start (only development mode)
	if (!this.configService.isProduction()) {
		console.log('AppService onApplicationBootstrap run one time crawl on app start');
    	await this.crawlerService.crawl();
	}
  }
}
