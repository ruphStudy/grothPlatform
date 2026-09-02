import { BadRequestException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { ProductsService } from '../products/products.service';
import { WebsiteContentExtractorService } from '../website-intelligence/website-content-extractor.service';
import type { WebsiteExtractedContent } from '../website-intelligence/website-content.types';
import { WebsiteFetchService } from '../website-intelligence/website-fetch.service';
import { ProductAnalysisResultDto } from './dto/product-analysis-result.dto';
import { normalizeAnalysisResult } from './normalize-analysis-result';
import { buildProductUnderstandingPrompt } from './prompts/product-understanding.prompt';
import {
  ProductIntelligenceProfile,
  ProductIntelligenceProfileDocument,
} from './schemas/product-intelligence-profile.schema';

type ContentQuality = 'good' | 'limited' | 'empty';

@Injectable()
export class ProductIntelligenceService {
  constructor(
    @InjectModel(ProductIntelligenceProfile.name)
    private readonly profileModel: Model<ProductIntelligenceProfileDocument>,
    private readonly productsService: ProductsService,
    private readonly aiService: AiService,
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
  ) {}

  private toSafeProfile(profile: ProductIntelligenceProfileDocument) {
    return {
      id: profile._id,
      organizationId: profile.organizationId,
      productId: profile.productId,
      summary: profile.summary,
      category: profile.category,
      businessModel: profile.businessModel,
      valueProposition: profile.valueProposition,
      coreFeatures: profile.coreFeatures,
      problemsSolved: profile.problemsSolved,
      targetAudiences: profile.targetAudiences,
      likelyUseCases: profile.likelyUseCases,
      differentiators: profile.differentiators,
      suggestedPositioning: profile.suggestedPositioning,
      marketingAngles: profile.marketingAngles,
      missingInformation: profile.missingInformation,
      confidenceScore: profile.confidenceScore,
      aiProvider: profile.aiProvider,
      aiModel: profile.aiModel,
      version: profile.version,
      createdAt: (profile as any).createdAt,
      updatedAt: (profile as any).updatedAt,
    };
  }

  async analyze(organizationId: string, productId: string, userId: string) {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    const { systemPrompt, userPrompt } = buildProductUnderstandingPrompt({
      name: product.name,
      websiteUrl: product.websiteUrl,
      shortDescription: product.shortDescription,
      productType: product.productType,
      primaryGoal: product.primaryGoal,
      targetMarkets: product.targetMarkets,
    });

    let generation: Awaited<ReturnType<AiService['generateStructured']>>;
    try {
      generation = await this.aiService.generateStructured<unknown>({ systemPrompt, userPrompt });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new UnprocessableEntityException('AI analysis failed');
    }

    const normalized = normalizeAnalysisResult(generation.data);
    const validated = plainToInstance(ProductAnalysisResultDto, normalized);
    const errors = await validate(validated);
    if (errors.length > 0) {
      throw new UnprocessableEntityException('AI returned an invalid analysis structure');
    }

    const existing = await this.profileModel.findOne({ productId: new Types.ObjectId(productId) }).exec();
    const version = existing ? existing.version + 1 : 1;

    const profile = await this.profileModel
      .findOneAndUpdate(
        { productId: new Types.ObjectId(productId) },
        {
          organizationId: new Types.ObjectId(organizationId),
          productId: new Types.ObjectId(productId),
          summary: validated.summary,
          category: validated.category,
          businessModel: validated.businessModel,
          valueProposition: validated.valueProposition,
          coreFeatures: validated.coreFeatures,
          problemsSolved: validated.problemsSolved,
          targetAudiences: validated.targetAudiences,
          likelyUseCases: validated.likelyUseCases,
          differentiators: validated.differentiators,
          suggestedPositioning: validated.suggestedPositioning,
          marketingAngles: validated.marketingAngles,
          missingInformation: validated.missingInformation,
          confidenceScore: validated.confidenceScore,
          aiProvider: generation.provider,
          aiModel: generation.model,
          version,
        },
        { upsert: true, new: true },
      )
      .exec();

    return this.toSafeProfile(profile);
  }

  async getProfile(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);

    const profile = await this.profileModel.findOne({ productId: new Types.ObjectId(productId) }).exec();
    if (!profile) {
      throw new NotFoundException('Product intelligence profile not found');
    }
    return this.toSafeProfile(profile);
  }

  /**
   * Live preview of what GIP can extract from the Product's configured
   * websiteUrl. Does not call AI and does not persist anything.
   */
  async previewWebsite(organizationId: string, productId: string, userId: string) {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    const websiteUrl = product.websiteUrl?.trim();
    if (!websiteUrl) {
      throw new BadRequestException('Product website URL is not configured');
    }

    const fetchResult = await this.websiteFetchService.fetchWebsite(websiteUrl);
    const extracted = this.websiteContentExtractorService.extract(fetchResult);
    const { contentQuality, contentWarning } = this.assessContentQuality(extracted);

    return {
      productId: product.id,
      websiteUrl,
      finalUrl: extracted.url,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      headings: extracted.headings,
      paragraphs: extracted.paragraphs,
      listItems: extracted.listItems,
      ctas: extracted.ctas,
      textContentPreview: extracted.textContent.slice(0, 5000),
      extraction: extracted.extraction,
      contentQuality,
      contentWarning,
      source: {
        configuredUrl: websiteUrl,
        finalUrl: extracted.url,
        contentType: fetchResult.contentType,
        fetchedAt: extracted.fetchedAt,
      },
      fetchedAt: extracted.fetchedAt,
    };
  }

  private assessContentQuality(extracted: WebsiteExtractedContent): {
    contentQuality: ContentQuality;
    contentWarning?: string;
  } {
    const totalHeadings = extracted.headings.h1.length + extracted.headings.h2.length + extracted.headings.h3.length;
    const totalTextBlocks = extracted.paragraphs.length + extracted.listItems.length;
    const chars = extracted.textContent.trim().length;

    if (chars < 40 && totalHeadings === 0 && totalTextBlocks === 0) {
      return {
        contentQuality: 'empty',
        contentWarning: 'This website returned almost no readable content without JavaScript execution.',
      };
    }

    if (chars < 400 || (totalHeadings === 0 && totalTextBlocks < 3)) {
      return {
        contentQuality: 'limited',
        contentWarning: 'This website appears to expose limited content without JavaScript execution.',
      };
    }

    return { contentQuality: 'good' };
  }
}
