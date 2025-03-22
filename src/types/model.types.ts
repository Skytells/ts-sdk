export interface Model {
  name: string;
  description?: string;
  namespace: string;
  type: string;
  billable?: boolean;
  pricing?: {
    amount: number;
    currency: string;
    unit: string;
  };
  status: string;
} 