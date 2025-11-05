import { Model, ModelType, ModelPrivacy, PricingOperator, PricingCriteria, Service } from '../src/types/model.types';

describe('Model Types', () => {
  describe('Model Interface', () => {
    test('should match basic image model structure', () => {
      const model: Model = {
        name: 'TrueFusion',
        description: 'TrueFusion Standard',
        namespace: 'truefusion',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'Skytells',
          description: 'Skytells is a cutting-edge AI company at the forefront of technological innovation. With a mission to transform industries and empower businesses.',
          image_url: 'https://avatars.githubusercontent.com/u/47755380?s=200&v=4',
          verified: true,
          slug: 'skytells',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.03,
          currency: 'USD',
          unit: 'image',
        },
        capabilities: ['text-to-image'],
        status: 'operational',
      };

      expect(model.name).toBe('TrueFusion');
      expect(model.type).toBe(ModelType.IMAGE);
      expect(model.privacy).toBe(ModelPrivacy.PUBLIC);
      expect(model.vendor.name).toBe('Skytells');
      expect(model.pricing?.amount).toBe(0.03);
      expect(model.capabilities).toContain('text-to-image');
    });

    test('should match video model structure', () => {
      const model: Model = {
        name: 'TrueFusion Video Pro',
        description: 'TrueFusion Video Pro',
        namespace: 'truefusion-video-pro',
        type: ModelType.VIDEO,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'Skytells',
          description: 'Skytells is a cutting-edge AI company at the forefront of technological innovation. With a mission to transform industries and empower businesses.',
          image_url: 'https://avatars.githubusercontent.com/u/47755380?s=200&v=4',
          verified: true,
          slug: 'skytells',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.196,
          currency: 'USD',
          unit: 'second',
        },
        capabilities: ['text-to-video', 'image-to-video'],
        status: 'operational',
      };

      expect(model.type).toBe(ModelType.VIDEO);
      expect(model.pricing?.unit).toBe('second');
      expect(model.capabilities).toHaveLength(2);
    });

    test('should support pricing with criterias', () => {
      const criterias: PricingCriteria[] = [
        {
          field: 'generate_audio',
          description: 'When audio generation is enabled',
          operator: PricingOperator.EQUALS,
          value: true,
          billable_price: 0.17,
          unit: 'second',
        },
        {
          field: 'generate_audio',
          description: 'When audio generation is disabled',
          operator: PricingOperator.EQUALS,
          value: false,
          billable_price: 0.13,
          unit: 'second',
        },
      ];

      const model: Model = {
        name: 'Veo 3.1 Fast',
        description: 'New and improved version of Veo 3 Fast, with higher-fidelity video, context-aware audio and last frame support',
        namespace: 'veo-3.1-fast',
        type: ModelType.VIDEO,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'Google',
          description: 'Google AI is a division of Google dedicated to artificial intelligence.',
          image_url: 'https://cdn1.iconfinder.com/data/icons/google-s-logo/150/Google_Icons-09-512.png',
          verified: true,
          slug: 'google',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.18,
          currency: 'USD',
          unit: 'second',
          criterias,
        },
        capabilities: ['image-to-video', 'text-to-video', 'partner', 'fast'],
        status: 'operational',
      };

      expect(model.pricing?.criterias).toBeDefined();
      expect(model.pricing?.criterias).toHaveLength(2);
      expect(model.pricing?.criterias?.[0].operator).toBe(PricingOperator.EQUALS);
      expect(model.pricing?.criterias?.[0].value).toBe(true);
      expect(model.pricing?.criterias?.[1].value).toBe(false);
    });

    test('should support pricing criterias with string values', () => {
      const criterias: PricingCriteria[] = [
        {
          field: 'resolution',
          description: 'When resolution is 720p',
          operator: PricingOperator.EQUALS,
          value: '720p',
          billable_price: 0.07,
          unit: 'image',
        },
        {
          field: 'resolution',
          description: 'When resolution is 1080p',
          operator: PricingOperator.EQUALS,
          value: '1080p',
          billable_price: 0.1,
          unit: 'image',
        },
      ];

      const model: Model = {
        name: 'TrueFusion 2.0',
        description: 'TrueFusion 2.0 Image lets you attach up to three images as ground truth and reference them by tags in your prompt.',
        namespace: 'truefusion-2',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'Skytells',
          description: 'Skytells is a cutting-edge AI company at the forefront of technological innovation. With a mission to transform industries and empower businesses.',
          image_url: 'https://avatars.githubusercontent.com/u/47755380?s=200&v=4',
          verified: true,
          slug: 'skytells',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.1,
          currency: 'USD',
          unit: 'image',
          criterias,
        },
        capabilities: ['image-to-image', 'text-to-image', 'reference', 'quality'],
        status: 'operational',
      };

      expect(model.pricing?.criterias?.[0].value).toBe('720p');
      expect(model.pricing?.criterias?.[1].value).toBe('1080p');
    });

    test('should support optional service field', () => {
      const service: Service = {
        type: 'prediction_serving',
        inference_party: 'partner',
      };

      const model: Model = {
        name: 'GPT-Image-1',
        description: 'A multimodal image generation model that creates high-quality images.',
        namespace: 'gpt-image-1',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'OpenAI',
          description: 'OpenAI, Inc. is an American artificial intelligence research organization founded in December 2015 and headquartered in San Francisco, California.',
          image_url: 'https://avatars.githubusercontent.com/u/14957082?v=4',
          verified: true,
          slug: 'openai',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.002,
          currency: 'USD',
          unit: 'image',
        },
        capabilities: ['text-to-image', 'image-to-image', 'quality'],
        status: 'operational',
        service,
      };

      expect(model.service).toBeDefined();
      expect(model.service?.type).toBe('prediction_serving');
      expect(model.service?.inference_party).toBe('partner');
    });

    test('should support model without service field', () => {
      const model: Model = {
        name: 'TrueFusion Ultra',
        description: 'Our flagship and most advanced text-to-image model yet.',
        namespace: 'truefusion-ultra',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        img_url: null,
        vendor: {
          name: 'Skytells',
          description: 'Skytells is a cutting-edge AI company at the forefront of technological innovation. With a mission to transform industries and empower businesses.',
          image_url: 'https://avatars.githubusercontent.com/u/47755380?s=200&v=4',
          verified: true,
          slug: 'skytells',
          metadata: null,
        },
        billable: true,
        pricing: {
          amount: 0.15,
          currency: 'USD',
          unit: 'image',
        },
        capabilities: ['text-to-image', 'image-to-image', 'quality'],
        status: 'operational',
      };

      expect(model.service).toBeUndefined();
    });

    test('should support different pricing units', () => {
      const models: Model[] = [
        {
          name: 'Model 1',
          namespace: 'model-1',
          type: ModelType.IMAGE,
          privacy: ModelPrivacy.PUBLIC,
          vendor: {
            name: 'Test',
            description: 'Test',
            image_url: 'https://example.com/image.png',
            verified: true,
            slug: 'test',
            metadata: null,
          },
          pricing: { amount: 0.1, currency: 'USD', unit: 'image' },
          capabilities: [],
          status: 'operational',
        },
        {
          name: 'Model 2',
          namespace: 'model-2',
          type: ModelType.VIDEO,
          privacy: ModelPrivacy.PUBLIC,
          vendor: {
            name: 'Test',
            description: 'Test',
            image_url: 'https://example.com/image.png',
            verified: true,
            slug: 'test',
            metadata: null,
          },
          pricing: { amount: 0.2, currency: 'USD', unit: 'second' },
          capabilities: [],
          status: 'operational',
        },
        {
          name: 'Model 3',
          namespace: 'model-3',
          type: ModelType.VIDEO,
          privacy: ModelPrivacy.PUBLIC,
          vendor: {
            name: 'Test',
            description: 'Test',
            image_url: 'https://example.com/image.png',
            verified: true,
            slug: 'test',
            metadata: null,
          },
          pricing: { amount: 1.0, currency: 'USD', unit: 'prediction' },
          capabilities: [],
          status: 'operational',
        },
        {
          name: 'Model 4',
          namespace: 'model-4',
          type: ModelType.IMAGE,
          privacy: ModelPrivacy.PUBLIC,
          vendor: {
            name: 'Test',
            description: 'Test',
            image_url: 'https://example.com/image.png',
            verified: true,
            slug: 'test',
            metadata: null,
          },
          pricing: { amount: 0.05, currency: 'USD', unit: 'gpu' },
          capabilities: [],
          status: 'operational',
        },
      ];

      expect(models[0].pricing?.unit).toBe('image');
      expect(models[1].pricing?.unit).toBe('second');
      expect(models[2].pricing?.unit).toBe('prediction');
      expect(models[3].pricing?.unit).toBe('gpu');
    });

    test('should support optional billable and pricing fields', () => {
      const model: Model = {
        name: 'Test Model',
        namespace: 'test-model',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        vendor: {
          name: 'Test',
          description: 'Test',
          image_url: 'https://example.com/image.png',
          verified: true,
          slug: 'test',
          metadata: null,
        },
        capabilities: [],
        status: 'operational',
      };

      expect(model.billable).toBeUndefined();
      expect(model.pricing).toBeUndefined();
    });

    test('should support vendor metadata as null or object', () => {
      const modelWithNullMetadata: Model = {
        name: 'Test Model',
        namespace: 'test-model',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        vendor: {
          name: 'Test',
          description: 'Test',
          image_url: 'https://example.com/image.png',
          verified: true,
          slug: 'test',
          metadata: null,
        },
        capabilities: [],
        status: 'operational',
      };

      const modelWithObjectMetadata: Model = {
        name: 'Test Model 2',
        namespace: 'test-model-2',
        type: ModelType.IMAGE,
        privacy: ModelPrivacy.PUBLIC,
        vendor: {
          name: 'Test',
          description: 'Test',
          image_url: 'https://example.com/image.png',
          verified: true,
          slug: 'test',
          metadata: { custom: 'data' },
        },
        capabilities: [],
        status: 'operational',
      };

      expect(modelWithNullMetadata.vendor.metadata).toBeNull();
      expect(modelWithObjectMetadata.vendor.metadata).toEqual({ custom: 'data' });
    });
  });

  describe('Enums', () => {
    test('ModelType should have correct values', () => {
      expect(ModelType.IMAGE).toBe('image');
      expect(ModelType.VIDEO).toBe('video');
    });

    test('ModelPrivacy should have correct values', () => {
      expect(ModelPrivacy.PUBLIC).toBe('public');
      expect(ModelPrivacy.PRIVATE).toBe('private');
    });

    test('PricingOperator should have correct values', () => {
      expect(PricingOperator.EQUALS).toBe('equals');
    });
  });
});

