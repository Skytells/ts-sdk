export enum ModelPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
}
export interface Model {
  name: string;
  description?: string;
  namespace: string;
  type: string;
  privacy: ModelPrivacy;
  vendor?: string | undefined;
  billable?: boolean;
  pricing?: {
    amount: number;
    currency: string;
    unit: string;
  };
  status: string;
} 