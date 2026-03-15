import { SkytellsError } from '../src/types/shared.types';

describe('SkytellsError', () => {
  test('is an instance of Error', () => {
    const err = new SkytellsError('msg', 'ERR_ID', 'details', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SkytellsError);
  });

  test('sets all properties', () => {
    const err = new SkytellsError('Something went wrong', 'VALIDATION_ERROR', 'field is required', 422);
    expect(err.message).toBe('Something went wrong');
    expect(err.errorId).toBe('VALIDATION_ERROR');
    expect(err.details).toBe('field is required');
    expect(err.httpStatus).toBe(422);
    expect(err.name).toBe('SkytellsError');
  });

  test('defaults httpStatus to 0 when not provided', () => {
    const err = new SkytellsError('msg', 'ERR', 'details');
    expect(err.httpStatus).toBe(0);
  });

  test('instanceof check works', () => {
    const err = new SkytellsError('test', 'TEST', 'test');
    try {
      throw err;
    } catch (e) {
      expect(e instanceof SkytellsError).toBe(true);
      expect(e instanceof Error).toBe(true);
    }
  });
});
