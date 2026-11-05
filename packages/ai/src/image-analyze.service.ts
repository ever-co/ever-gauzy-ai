/// <reference types="multer" />
// `Express.Multer.File` is a global augmentation from @types/multer; TypeScript 6 no longer includes
// @types packages automatically, so ts-node (sdk:generate) needs the explicit reference.
import { Injectable, Optional, ServiceUnavailableException, Inject } from "@nestjs/common";
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { isJSON } from "class-validator";
import { Request } from 'express';
import { ConfigurationService } from '@packages/config';
import { OpenAICredentials, OpenAIService } from "./openai/openai.service";
import { RequestContext } from "@packages/core/context";
import { fetchImage, ImageFetchError } from "./image-fetch";

interface ImageAnalysisResult {
    success: boolean;
    data: {
        mimetype: string;
        filename: string;
        analysis: Array<{
            work: boolean;
            description: string;
            apps: string[];
        }>;
        message?: string;
    };
}

/**
 * ImageAnalyze Service
 */
@Injectable()
export class ImageAnalyzeService {

    constructor(
        private readonly _configurationService: ConfigurationService,
        private readonly _openAIService: OpenAIService,
        @Optional() @Inject(PluginRegistry) private readonly _plugins?: PluginSwitch,
    ) { }

    /**
     * Analyze images using OpenAI and return the results.
     *
     * @param files - An array of MulterFile objects representing the uploaded images.
     * @param _request - Express Request object.
     * @returns Promise<any[]> - An array of analysis results for each image.
     */
    /**
     * The plugin switch, then the authenticated tenant's own OpenAI credentials (TenantApiKey) when it
     * has them — captured for this request and passed to every call, never written into the shared
     * OpenAI client (another tenant's request could otherwise replace them mid-download).
     */
    private requestOpenAiCredentials(): OpenAICredentials | undefined {
        if (!pluginEnabled(this._plugins, CAPABILITY_PLUGINS.screenshotAnalysis)) {
            throw new ServiceUnavailableException('The screenshot-analysis plugin is disabled (GAUZY_AI_PLUGINS_DISABLED)');
        }
        const tenantApiKey = RequestContext.currentTenantApiKey();
        const apiKey = tenantApiKey?.['openAiSecretKey'] || undefined;
        const organization = tenantApiKey?.['openAiOrganizationId'] || undefined;
        return apiKey ? { apiKey, organization } : undefined;
    }

    public async analyzeImages(files: Express.Multer.File[]): Promise<any[]> {
        const credentials = this.requestOpenAiCredentials();
        // Array to store the analysis results for each image
        const analysis: any[] = [];

        /** Iterate through the provided array of files for analysis. */
        for await (const file of files) {
            try {
                // Assuming you have a function to analyze a single image
                const result = await this.analyzeSingleImage(file, credentials);
                analysis.push(result);
            } catch (error) {
                console.error(`Error analyzing image ${file.originalname}:`, error);
            }
        }

        // Return the array of analysis results
        return analysis;
    }


    /**
     * Analyze images given by URL (issue #91): the API downloads each image itself — the caller
     * (e.g. the Ever Gauzy API) sends only links, typically signed storage URLs, instead of the
     * image bytes. Downloads are limited to public hosts, image content types, IMAGE_FETCH_MAX_BYTES
     * and IMAGE_FETCH_TIMEOUT_MS (see image-fetch.ts); a URL that cannot be fetched yields an entry
     * with `success: false` and the reason, the others are still analyzed.
     */
    public async analyzeImageUrls(urls: string[]): Promise<any[]> {
        const credentials = this.requestOpenAiCredentials();
        const results: any[] = [];
        for (const url of urls) {
            try {
                const image = await fetchImage(url);
                const file = { buffer: image.buffer, mimetype: image.mimetype, originalname: image.originalname, size: image.size } as Express.Multer.File;
                const result = await this.analyzeSingleImage(file, credentials);
                results.push({ ...result, data: { url, ...result.data } });
            } catch (error) {
                const reason = error instanceof ImageFetchError ? error.message : `Analysis failed: ${error.message}`;
                results.push({ success: false, data: { url, filename: null, mimetype: null, analysis: [], message: reason } });
            }
        }
        return results;
    }

    /**
     * Analyze a single image using OpenAI.
     *
     * @param file - MulterFile object representing the uploaded image.
     * @returns Promise<any> - The analysis result for the image.
     */
    private async analyzeSingleImage(
        file: Express.Multer.File,
        credentials?: OpenAICredentials
    ): Promise<ImageAnalysisResult> {
        // Step 1: Define the prompt for the image analysis
        const prompt = 'Please analyze the image or screenshots of PC monitors and respond in a array containing format indicating whether each screenshot is work-related (true) or not (false). For each screenshot, provide a brief 1-3 sentence description of the activity shown. The JSON response should have a work key with a boolean value and a description key with the activity description. In addition, add `apps` key with value as array of strings, where each string is the name of application that was run on PC, starting first with app that most probably was active. Reply with a array containing an object for each screenshot with described fields. Please parse JSON response and remove json and additional response and unnecessary white space';

        // Step 2: Define options for the chat completion request
        const options = {
            model: this._configurationService.openAIVisionPreviewModel(),
            max_tokens: 1000
        };

        // Step 3: Create messages array with the image URL
        const messages = [
            {
                role: 'user' as const,
                content: [
                    {
                        type: 'image_url',
                        image_url: `data:image/png;base64,${file.buffer.toString('base64')}`,
                    }
                ]
            }
        ];

        // Step 4: Set the role for the chat completion request
        const role = 'system' as const;

        // Step 5: Use the createChatCompletion function to get the analysis completion
        const completion = await this._openAIService.createChatCompletion(prompt, options, role, messages, credentials);
        if (completion === undefined || completion === null || completion === '') {
            // the OpenAI wrapper logs the error and returns nothing: say so instead of an empty failure
            return {
                success: false,
                data: { mimetype: file.mimetype, filename: file.originalname, analysis: [], message: 'Analysis failed: no response from the model (see the API log for the error)' },
            };
        }
        const isJson = isJSON(completion);

        // Step 6: Return the result including the original filename and analysis
        return {
            success: isJson,
            data: {
                mimetype: file.mimetype,
                filename: file.originalname,
                analysis: isJson ? JSON.parse(completion) : [],
                ...(isJson ? {} : { message: completion }),
            }
        };
    }
}