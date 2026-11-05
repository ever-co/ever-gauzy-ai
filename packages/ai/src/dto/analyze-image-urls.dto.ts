import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUrl } from 'class-validator';

/** Body of POST /api/image/process-urls. */
export class AnalyzeImageUrlsDto {
	@ApiProperty({ type: [String], description: 'Public http(s) image URLs (signed storage links work); 1-10 per call', example: ['https://storage.example.com/shots/1.png?token=...'] })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(10)
	@IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }, { each: true })
	urls: string[];
}
