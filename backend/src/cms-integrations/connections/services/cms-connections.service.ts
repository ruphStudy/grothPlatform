import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CmsEngineService } from '../../engine/cms-engine.service';
import { CmsCapabilityUnsupportedError, CmsConfigurationError, CmsProviderError } from '../../errors/cms.errors';
import { normalizeSiteUrl } from '../../providers/wordpress-http.util';
import type { CmsCredential } from '../../types/cms.types';
import { CmsConnection, CmsConnectionDocument } from '../schemas/cms-connection.schema';
import type { CmsConnectionResponse, ConnectWordPressInput, UpdateCmsConnectionInput } from '../types/cms-connection.types';
import { CmsCredentialEncryptionService } from './cms-credential-encryption.service';

/**
 * 20B: persists reusable CMS site connections. Credentials are only ever
 * stored as CmsCredentialEncryptionService ciphertext, and only the safe
 * CmsConnectionResponse projection (never a credential) leaves this
 * service. No post creation happens here — that's later Sprint 20
 * territory; this only validates that a site/credential pair genuinely
 * works.
 */
@Injectable()
export class CmsConnectionsService {
  constructor(
    @InjectModel(CmsConnection.name) private readonly connectionModel: Model<CmsConnectionDocument>,
    private readonly cmsEngine: CmsEngineService,
    private readonly credentialEncryption: CmsCredentialEncryptionService,
  ) {}

  // Only persists after a successful validation (item 21) — a failed
  // initial connect attempt never creates any record, active or
  // otherwise (item F).
  async connectWordPress(organizationId: string, productId: string, input: ConnectWordPressInput, userId: string): Promise<CmsConnectionResponse> {
    const siteUrl = normalizeSiteUrl(input.siteUrl);
    const credential: CmsCredential = { authType: 'application_password', username: input.username, secret: input.applicationPassword };
    const result = await this.cmsEngine.validateConnection('wordpress', { siteUrl, credential });

    const encryptedCredential = this.credentialEncryption.encrypt(input.applicationPassword);
    const doc = await this.connectionModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), platform: 'wordpress', siteUrl },
      {
        $set: {
          siteName: result.siteInfo.siteName,
          externalSiteId: result.siteInfo.externalSiteId,
          authType: 'application_password',
          encryptedCredential,
          username: input.username,
          status: 'active',
          providerName: 'wordpress',
          capabilities: result.capabilities,
          lastValidatedAt: new Date(),
          lastErrorCode: undefined,
          connectedBy: new Types.ObjectId(userId),
        },
        $setOnInsert: {
          organizationId: new Types.ObjectId(organizationId),
          productId: new Types.ObjectId(productId),
          platform: 'wordpress',
          siteUrl,
        },
      },
      { upsert: true, new: true },
    );
    return this.toResponse(doc!);
  }

  async list(organizationId: string, productId: string): Promise<CmsConnectionResponse[]> {
    const docs = await this.connectionModel
      .find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, connectionId: string): Promise<CmsConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    return this.toResponse(doc);
  }

  // Exactly one logical provider validation operation (item 25/L):
  // decrypts the currently-stored credential and re-validates it. A
  // rejection here downgrades this EXISTING connection's own status —
  // never deletes its history.
  async validate(organizationId: string, productId: string, connectionId: string): Promise<CmsConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    try {
      const secret = this.credentialEncryption.decrypt(doc.encryptedCredential);
      const credential: CmsCredential = { authType: doc.authType, username: doc.username, secret };
      const result = await this.cmsEngine.validateConnection(doc.platform, { siteUrl: doc.siteUrl, credential });
      doc.status = 'active';
      doc.lastErrorCode = undefined;
      doc.capabilities = result.capabilities;
      if (result.siteInfo.siteName) doc.siteName = result.siteInfo.siteName;
    } catch (err) {
      doc.status = 'invalid';
      doc.lastErrorCode = this.extractErrorCode(err);
    }
    doc.lastValidatedAt = new Date();
    await doc.save();
    return this.toResponse(doc);
  }

  // Reconnect / update credentials (item 26). Always validates the NEW
  // credential before storing it — a failed validation here throws and
  // leaves the existing (still-working) stored credential untouched,
  // rather than silently overwriting it with something unverified.
  async update(organizationId: string, productId: string, connectionId: string, input: UpdateCmsConnectionInput): Promise<CmsConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    const username = input.username ?? doc.username;
    if (!username) {
      throw new BadRequestException('A WordPress username is required.');
    }
    const secret = input.applicationPassword ?? this.credentialEncryption.decrypt(doc.encryptedCredential);
    const credential: CmsCredential = { authType: doc.authType, username, secret };
    const result = await this.cmsEngine.validateConnection(doc.platform, { siteUrl: doc.siteUrl, credential });

    doc.username = username;
    if (input.applicationPassword) {
      doc.encryptedCredential = this.credentialEncryption.encrypt(input.applicationPassword);
    }
    doc.status = 'active';
    doc.lastErrorCode = undefined;
    doc.capabilities = result.capabilities;
    if (result.siteInfo.siteName) doc.siteName = result.siteInfo.siteName;
    doc.lastValidatedAt = new Date();
    await doc.save();
    return this.toResponse(doc);
  }

  // Honest local disable only — never claims a remote WordPress
  // Application Password was revoked; that is site-side and this
  // provider does not call any such endpoint (item 27).
  async disconnect(organizationId: string, productId: string, connectionId: string): Promise<CmsConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    doc.status = 'revoked';
    await doc.save();
    return this.toResponse(doc);
  }

  private extractErrorCode(err: unknown): string {
    if (err instanceof CmsProviderError || err instanceof CmsCapabilityUnsupportedError || err instanceof CmsConfigurationError) {
      return err.code;
    }
    return 'cms_provider_request_failed';
  }

  private async findOwned(organizationId: string, productId: string, connectionId: string): Promise<CmsConnectionDocument> {
    let doc: CmsConnectionDocument | null;
    try {
      doc = await this.connectionModel.findOne({
        _id: new Types.ObjectId(connectionId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
      });
    } catch {
      throw new NotFoundException('CMS connection not found.');
    }
    if (!doc) throw new NotFoundException('CMS connection not found.');
    return doc;
  }

  private toResponse(doc: CmsConnectionDocument): CmsConnectionResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      siteUrl: doc.siteUrl,
      siteName: doc.siteName,
      username: doc.username,
      status: doc.status,
      capabilities: doc.capabilities,
      lastValidatedAt: doc.lastValidatedAt,
      lastErrorCode: doc.lastErrorCode,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
