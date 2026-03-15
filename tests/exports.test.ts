import Skytells, { SkytellsClient, Prediction, PredictionsAPI, ModelsAPI, SkytellsError, createClient, API_BASE_URL } from '../src';
import { PredictionStatus, PredictionType, PredictionSource } from '../src/types/predict.types';
import { ApiErrorId } from '../src/types/shared.types';

describe('Exports', () => {
  test('default export is the Skytells function', () => {
    expect(typeof Skytells).toBe('function');
  });

  test('named Skytells export is a function', () => {
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const { Skytells: NamedSkytells } = require('../src');
    expect(typeof NamedSkytells).toBe('function');
  });

  test('createClient is exported (deprecated alias)', () => {
    expect(typeof createClient).toBe('function');
  });

  test('SkytellsClient class is exported', () => {
    expect(SkytellsClient).toBeDefined();
  });

  test('Prediction class is exported', () => {
    expect(Prediction).toBeDefined();
  });

  test('PredictionsAPI class is exported', () => {
    expect(PredictionsAPI).toBeDefined();
  });

  test('ModelsAPI class is exported', () => {
    expect(ModelsAPI).toBeDefined();
  });

  test('SkytellsError class is exported', () => {
    expect(SkytellsError).toBeDefined();
  });

  test('API_BASE_URL is exported', () => {
    expect(API_BASE_URL).toBe('https://api.skytells.ai/v1');
  });

  test('PredictionStatus enum is exported', () => {
    expect(PredictionStatus.SUCCEEDED).toBe('succeeded');
    expect(PredictionStatus.FAILED).toBe('failed');
    expect(PredictionStatus.CANCELLED).toBe('cancelled');
    expect(PredictionStatus.PENDING).toBe('pending');
    expect(PredictionStatus.PROCESSING).toBe('processing');
    expect(PredictionStatus.STARTING).toBe('starting');
    expect(PredictionStatus.STARTED).toBe('started');
  });

  test('PredictionType enum is exported', () => {
    expect(PredictionType.INFERENCE).toBe('inference');
    expect(PredictionType.TRAINING).toBe('training');
  });

  test('PredictionSource enum is exported', () => {
    expect(PredictionSource.API).toBe('api');
    expect(PredictionSource.CLI).toBe('cli');
    expect(PredictionSource.WEB).toBe('web');
  });

  test('ApiErrorId enum is exported', () => {
    expect(ApiErrorId.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ApiErrorId.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
    expect(ApiErrorId.INSUFFICIENT_CREDITS).toBe('INSUFFICIENT_CREDITS');
    expect(ApiErrorId.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
  });
});
