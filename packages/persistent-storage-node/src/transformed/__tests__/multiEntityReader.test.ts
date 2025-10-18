import { describe, it, expect } from 'vitest';
import { mergeGenerators } from '../multiEntityReader.js';

type FirstGeneratorMessage = { firstGenerator: number };
type SecondGeneratorMessage = { secondGenerator: number };
type ThirdGeneratorMessage = { thirdGenerator: number };

function createControlledGenerator<T>(name: string, messageFactory: (index: number) => T) {
  const queue: T[][] = [];
  let resolveNext: ((value: IteratorResult<T[]>) => void) | null = null;
  let index = 0;

  const generator = (async function* () {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<IteratorResult<T[]>>((resolve) => {
          resolveNext = resolve;
        });
        if (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    }
  })();

  return {
    generator,
    push: (count = 1) => {
      const messages = Array.from({ length: count }, () => messageFactory(index++));
      queue.push(messages);
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ done: false, value: messages });
      }
    },
    name,
  };
}

describe('mergeEntityStreams - Behavioral Tests', () => {
  it('should handle when only one generator yields', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );
    const second = createControlledGenerator(
      'second',
      (i): SecondGeneratorMessage => ({
        secondGenerator: i,
      }),
    );
    const third = createControlledGenerator(
      'third',
      (i): ThirdGeneratorMessage => ({
        thirdGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
      second: second.generator,
      third: third.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Initially, the generator will try to fetch from all streams
    // Push one message to first generator
    first.push(1);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(1);
    expect(result1.value[0]).toEqual({
      value: { firstGenerator: 0 },
      streamName: 'first',
    });

    // Tell it to done this message and take more from first
    const control1 = {
      done: result1.value,
      takeMore: ['first' as const],
    };

    // Push another message to first
    first.push(1);

    const result2 = await gen.next(control1);
    expect(result2.done).toBe(false);
    expect(result2.value).toHaveLength(1);
    expect(result2.value[0]).toEqual({
      value: { firstGenerator: 1 },
      streamName: 'first',
    });

    // Cleanup
    await gen.return([]);
  });

  it('should handle when two generators yield at the same time', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );
    const second = createControlledGenerator(
      'second',
      (i): SecondGeneratorMessage => ({
        secondGenerator: i,
      }),
    );
    const third = createControlledGenerator(
      'third',
      (i): ThirdGeneratorMessage => ({
        thirdGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
      second: second.generator,
      third: third.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Push messages to first and second generators simultaneously
    first.push(2);
    second.push(2);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(4);

    // Should have 2 messages from first and 2 from second
    const firstMessages = result1.value.filter((m) => m.streamName === 'first');
    const secondMessages = result1.value.filter((m) => m.streamName === 'second');

    expect(firstMessages).toHaveLength(2);
    expect(secondMessages).toHaveLength(2);

    expect(firstMessages[0].value).toEqual({ firstGenerator: 0 });
    expect(firstMessages[1].value).toEqual({ firstGenerator: 1 });
    expect(secondMessages[0].value).toEqual({ secondGenerator: 0 });
    expect(secondMessages[1].value).toEqual({ secondGenerator: 1 });

    // Cleanup
    await gen.return([]);
  });

  it('should handle when three generators yield at the same time', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );
    const second = createControlledGenerator(
      'second',
      (i): SecondGeneratorMessage => ({
        secondGenerator: i,
      }),
    );
    const third = createControlledGenerator(
      'third',
      (i): ThirdGeneratorMessage => ({
        thirdGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
      second: second.generator,
      third: third.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Push messages to all three generators simultaneously
    first.push(1);
    second.push(1);
    third.push(1);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(3);

    // Should have 1 message from each stream
    const firstMessages = result1.value.filter((m) => m.streamName === 'first');
    const secondMessages = result1.value.filter((m) => m.streamName === 'second');
    const thirdMessages = result1.value.filter((m) => m.streamName === 'third');

    expect(firstMessages).toHaveLength(1);
    expect(secondMessages).toHaveLength(1);
    expect(thirdMessages).toHaveLength(1);

    expect(firstMessages[0].value).toEqual({ firstGenerator: 0 });
    expect(secondMessages[0].value).toEqual({ secondGenerator: 0 });
    expect(thirdMessages[0].value).toEqual({ thirdGenerator: 0 });

    // Cleanup
    await gen.return([]);
  });

  it('should handle done without takeMore and yield empty array after 1 second heartbeat', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Push one message to first
    first.push(1);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(1);
    expect(result1.value[0]).toEqual({
      value: { firstGenerator: 0 },
      streamName: 'first',
    });

    // Skip the message without requesting more
    // Since we don't request more and the stream has no new data, should wait for heartbeat
    const startTime = Date.now();
    const control = {
      done: result1.value,
      takeMore: [],
    };

    // Should wait ~1 second for heartbeat and return empty array
    const result2 = await gen.next(control);
    const elapsed = Date.now() - startTime;

    expect(result2.done).toBe(false);
    expect(result2.value).toHaveLength(0);
    // Should take at least 900ms (allowing some tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(1200);

    // Cleanup
    await gen.return([]);
  });

  it('should handle takeMore to fetch next batch from specific streams', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );
    const second = createControlledGenerator(
      'second',
      (i): SecondGeneratorMessage => ({
        secondGenerator: i,
      }),
    );
    const third = createControlledGenerator(
      'third',
      (i): ThirdGeneratorMessage => ({
        thirdGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
      second: second.generator,
      third: third.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Push messages to all streams
    first.push(1);
    second.push(1);
    third.push(1);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(3);

    // Skip all messages but only request more from first and third
    first.push(1);
    third.push(1);

    const control1 = {
      done: result1.value,
      takeMore: ['first' as const, 'third' as const],
    };

    const result2 = await gen.next(control1);
    expect(result2.done).toBe(false);
    expect(result2.value).toHaveLength(2);

    const firstMessages = result2.value.filter((m) => m.streamName === 'first');
    const thirdMessages = result2.value.filter((m) => m.streamName === 'third');

    expect(firstMessages).toHaveLength(1);
    expect(thirdMessages).toHaveLength(1);
    expect(firstMessages[0].value).toEqual({ firstGenerator: 1 });
    expect(thirdMessages[0].value).toEqual({ thirdGenerator: 1 });

    // Now request more from second
    second.push(1);

    const control2 = {
      done: result2.value,
      takeMore: ['second' as const],
    };

    const result3 = await gen.next(control2);
    expect(result3.done).toBe(false);
    expect(result3.value).toHaveLength(1);
    expect(result3.value[0]).toEqual({
      value: { secondGenerator: 1 },
      streamName: 'second',
    });

    // Cleanup
    await gen.return([]);
  });

  it('should cache messages that are not doneped', async () => {
    const first = createControlledGenerator(
      'first',
      (i): FirstGeneratorMessage => ({
        firstGenerator: i,
      }),
    );
    const second = createControlledGenerator(
      'second',
      (i): SecondGeneratorMessage => ({
        secondGenerator: i,
      }),
    );

    const streams = {
      first: first.generator,
      second: second.generator,
    };

    const gen = mergeGenerators(streams, {});

    // Push messages to both streams
    first.push(2);
    second.push(1);

    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toHaveLength(3);

    // Skip only the second stream's message, keep first stream's messages
    const secondMessage = result1.value.find((m) => m.streamName === 'second')!;

    const control1 = {
      done: [secondMessage],
      takeMore: [],
    };

    // Should yield the cached messages from first stream immediately
    const result2 = await gen.next(control1);
    expect(result2.done).toBe(false);
    expect(result2.value).toHaveLength(2);
    expect(result2.value.every((m) => m.streamName === 'first')).toBe(true);
    expect(result2.value[0].value).toEqual({ firstGenerator: 0 });
    expect(result2.value[1].value).toEqual({ firstGenerator: 1 });

    // Cleanup
    await gen.return([]);
  });
});
