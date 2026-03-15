export enum ModelPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum ModelType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  MUSIC = 'music',
  TEXT = 'text',
  CODE = 'code',
  MULTIMODAL = 'multimodal',
}

export enum PricingUnit {
  IMAGE = 'image',
  VIDEO = 'video',
  SECOND = 'second',
  PREDICTION = 'prediction',
  GPU = 'gpu',
  IMAGE_MEGAPIXEL = 'image_megapixel',
  COMPUTING_SECOND = 'computing_second',
  AUDIO_SECOND = 'audio_second',
  VIDEO_SECOND = 'video_second',
  TOKEN = 'token',
  FIVE_SECONDS = '5 seconds',
  MINUTE = 'minute',

}

export enum PricingOperator {
  EQUALS = 'equals',
  DOUBLE_EQUALS = '==',
}

export interface PricingCriteria {
  field: string;
  description: string;
  operator: PricingOperator;
  value: string | boolean | number;
  billable_price: number;
  unit: string;
}

export interface PricingFormulaTerm {
  megapixel_type: string;
  megapixels_key: string;
  rate_key: string;
}

export interface PricingFormula {
  description: string;
  type: string;
  variables: Record<string, number>;
  terms: PricingFormulaTerm[];
  result_key: string;
}

export interface Pricing {
  amount: number;
  currency: string;
  unit: string;
  criterias?: PricingCriteria[];
  formula?: PricingFormula;
}

export interface Vendor {
  name: string;
  description: string;
  image_url: string;
  verified: boolean;
  slug: string;
  metadata: any | null;
}

export interface Service {
  type: string;
  inference_party: string;
}

export interface DeploymentHardware {
  type: string;
  slug: string;
}

export interface ModelMetadata {
  edge_compatible: boolean;
  openai_compatible: boolean;
  cold_boot: boolean;
  deployment_hardware?: DeploymentHardware;
}

export interface ModelInputSchema {
  type: string;
  title?: string;
  required?: string[];
  properties?: Record<string, Record<string, any>>;
}

export interface ModelOutputSchema {
  type: string;
  title?: string;
  required?: string[];
  properties?: Record<string, Record<string, any>>;
}

export interface ModelFieldsOptions {
  fields?: ('input_schema' | 'output_schema')[];
}

export interface Model {
  name: string;
  description?: string;
  namespace: string;
  type: ModelType;
  privacy: ModelPrivacy;
  img_url?: string | null;
  vendor: Vendor;
  billable?: boolean;
  pricing?: Pricing;
  capabilities: string[];
  metadata?: ModelMetadata;
  status: string;
  service?: Service;
  input_schema?: ModelInputSchema | null;
  output_schema?: ModelOutputSchema | null;
} 