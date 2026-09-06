export interface BrandColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
}

export interface BrandLogoUsage {
  enabled: boolean;
  preferredAssetId?: string;
}

export interface BrandVisualProfileInput {
  colors?: BrandColors;
  visualStyle?: string[];
  avoidStyles?: string[];
  preferredSubjects?: string[];
  avoidSubjects?: string[];
  logoUsage?: BrandLogoUsage;
}

export interface BrandVisualProfileResponse {
  organizationId: string;
  productId: string;
  colors?: BrandColors;
  visualStyle: string[];
  avoidStyles: string[];
  preferredSubjects: string[];
  avoidSubjects: string[];
  logoUsage?: BrandLogoUsage;
  updatedAt: Date;
}
