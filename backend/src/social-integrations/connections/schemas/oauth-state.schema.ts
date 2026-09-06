import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SOCIAL_PLATFORMS } from '../../types/social.types';
import type { SocialPlatform } from '../../types/social.types';

export type OAuthStateDocument = HydratedDocument<OAuthState>;

// Short-lived, one-time-use, signed-by-randomness state binding an OAuth
// authorization request to the exact organization/product/platform/user
// that started it (18B item 19/20). The callback trusts nothing from the
// query string except this token — organizationId/productId are resolved
// FROM the state record, never from caller-supplied callback params.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class OAuthState {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  consumedAt?: Date;

  // 18D (X): PKCE code_verifier, generated server-side and stored here
  // only — never placed in the browser-visible state/query payload.
  @Prop()
  codeVerifier?: string;

  createdAt?: Date;
}
export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
