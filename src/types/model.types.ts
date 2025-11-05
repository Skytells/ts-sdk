export enum ModelPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum ModelType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum PricingUnit {
  IMAGE = 'image',
  VIDEO = 'video',
  SECOND = 'second',
  PREDICTION = 'prediction',
  GPU = 'gpu',
}

export enum PricingOperator {
  EQUALS = 'equals',
}

export interface PricingCriteria {
  field: string;
  description: string;
  operator: PricingOperator;
  value: string | boolean | number;
  billable_price: number;
  unit: string;
}

export interface Pricing {
  amount: number;
  currency: string;
  unit: string;
  criterias?: PricingCriteria[];
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
  status: string;
  service?: Service;
} 