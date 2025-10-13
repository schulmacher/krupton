import { describe, expectTypeOf, it } from 'vitest';
import { mergeGenerators } from '../multiEntityReader.js';

describe('mergeEntityStreams - Type Tests', () => {
  it('should correctly infer stream names and value types with discriminated union', async () => {
    // Setup: Create mock streams with DIFFERENT types
    async function* streamA() {
      yield [{ id: 1, foo: 'A' }];
    }

    async function* streamB() {
      yield [{ id: 2, bar: 'B' }];
    }

    const streams = {
      streamA: streamA(),
      streamB: streamB(),
    };

    const gen = mergeGenerators(streams, {});
    const result = await gen.next();

    // Type assertions
    if (!result.done) {
      const messages = result.value;
      const [firstResult] = messages;

      // Verify streamName is strongly typed as union of stream keys
      type ExpectedStreamName = 'streamA' | 'streamB';
      expectTypeOf(firstResult.streamName).toExtend<ExpectedStreamName>();

      // Test discriminated union - when streamName is 'streamA', value should have 'foo'
      if (firstResult.streamName === 'streamA') {
        type ExpectedValueA = Array<{ id: number; foo: string }>;
        expectTypeOf(firstResult.value).toEqualTypeOf<ExpectedValueA>();
        // This should narrow to the specific type
        expectTypeOf(firstResult.value[0].foo).toBeString();
      }

      // Test discriminated union - when streamName is 'streamB', value should have 'bar'
      if (firstResult.streamName === 'streamB') {
        type ExpectedValueB = Array<{ id: number; bar: string }>;
        expectTypeOf(firstResult.value).toEqualTypeOf<ExpectedValueB>();
        // This should narrow to the specific type
        expectTypeOf(firstResult.value[0].bar).toBeString();
      }

      // Before narrowing, value should be a union type
      type ExpectedValueUnion =
        | Array<{ id: number; foo: string }>
        | Array<{ id: number; bar: string }>;
      expectTypeOf(firstResult.value).toEqualTypeOf<ExpectedValueUnion>();
    }
  });

  it('should work with different value types per stream (union type)', async () => {
    async function* numberStream() {
      yield [42];
    }

    async function* stringStream() {
      yield ['hello'];
    }

    const streams = {
      numbers: numberStream(),
      strings: stringStream(),
    };

    const gen = mergeGenerators(streams, {});
    const result = await gen.next();

    if (!result.done) {
      const messages = result.value;

      // StreamName should be 'numbers' | 'strings'
      type ExpectedStreamName = 'numbers' | 'strings';
      expectTypeOf(messages[0].streamName).toExtend<ExpectedStreamName>();

      // Value should be array of number | array of string (union of both stream types)
      type ExpectedValue = number[] | string[];
      expectTypeOf(messages[0].value).toEqualTypeOf<ExpectedValue>();
    }
  });

  it('should infer types for single stream', async () => {
    async function* singleStream() {
      yield [{ data: 'test' }];
    }

    const streams = {
      myStream: singleStream(),
    };

    const gen = mergeGenerators(streams, {});
    const result = await gen.next();

    if (!result.done) {
      const messages = result.value;

      // StreamName should be exactly 'myStream'
      type ExpectedStreamName = 'myStream';
      expectTypeOf(messages[0].streamName).toExtend<ExpectedStreamName>();

      // Value should be the exact type (array)
      type ExpectedValue = Array<{ data: string }>;
      expectTypeOf(messages[0].value).toEqualTypeOf<ExpectedValue>();
    }
  });

  it('should accept control object with correct types', async () => {
    async function* testStream() {
      yield [{ value: 123 }];
    }

    const streams = {
      test: testStream(),
    };

    const gen = mergeGenerators(streams, {});
    const result = await gen.next();

    if (!result.done) {
      const messages = result.value;

      // Create control object - should type check
      const control = {
        done: messages,
        takeMore: ['test' as const],
      };

      // This should pass type checking
      type ExpectedStreamName = 'test';
      expectTypeOf(control.done[0].streamName).toExtend<ExpectedStreamName>();

      type ExpectedValue = Array<{ value: number }>;
      expectTypeOf(control.done[0].value).toEqualTypeOf<ExpectedValue>();

      // Verify takeMore accepts the correct stream names
      expectTypeOf(control.takeMore[0]).toExtend<ExpectedStreamName>();

      // Send control back to generator
      await gen.next(control);
    }
  });
});
