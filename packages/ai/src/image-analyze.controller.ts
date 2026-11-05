/// <reference types="multer" />
// `Express.Multer.File` is a global augmentation from @types/multer; TypeScript 6 no longer includes
// @types packages automatically, so ts-node (sdk:generate) needs the explicit reference.
import {
	Body,
	Controller,
	Post,
	UploadedFiles,
	UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImageAnalyzeService } from './image-analyze.service';
import { AnalyzeImageUrlsDto } from './dto/analyze-image-urls.dto';

@ApiTags('image-analysis')
@Controller('api/image')
export class ImageAnalyzeController {

	constructor(
		private readonly _imageAnalyzeService: ImageAnalyzeService
	) { }

	/**
	 * Process and analyze uploaded images using OpenAI.
	 *
	 * @param files - An array of uploaded image files.
	 * @param req - Express Request object.
	 * @returns Promise<void>
	 */
	@ApiOperation({ summary: 'Analyze uploaded screenshots (multipart field `files`)' })
	@Post('/process')
	@UseInterceptors(FilesInterceptor('files'))
	async processImageAnalyze(
		@UploadedFiles() files: Express.Multer.File[]
	): Promise<any[]> {
		// errors propagate: a disabled plugin is a 503, not an empty 201
		return await this._imageAnalyzeService.analyzeImages(files);
	}

	/**
	 * Analyze images by URL (issue #91): the Ever Gauzy API sends links (e.g. signed storage URLs)
	 * and this API downloads the images itself, which keeps image bytes off the API-to-API path.
	 * The upload endpoint above stays for callers that already have the bytes.
	 */
	@Post('/process-urls')
	@ApiOperation({ summary: 'Analyze screenshots given by URL (the API downloads them; public hosts, images only, size/time limits)' })
	@ApiBody({ type: AnalyzeImageUrlsDto })
	async processImageUrls(@Body() body: AnalyzeImageUrlsDto): Promise<any[]> {
		return await this._imageAnalyzeService.analyzeImageUrls(body.urls);
	}
}
