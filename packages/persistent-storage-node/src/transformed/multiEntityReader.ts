import { arrayToMultiMap, sleep } from '@krupton/utils';

export type TaggedMessage<Value, StreamName extends string = string> = {
  value: Value;
  streamName: StreamName;
};

// Helper type to extract the yielded value type from an AsyncGenerator
type ExtractGeneratorValue<G> = G extends AsyncGenerator<infer V, unknown, unknown> ? V : never;

// Helper type to flatten array types
type FlattenIfArray<T> = T extends (infer U)[] ? U : T;

// Create a discriminated union where each stream name is paired with its specific value type
type TaggedMessagesUnion<T extends Record<string, AsyncGenerator<unknown>>> = {
  [K in keyof T]: TaggedMessage<FlattenIfArray<ExtractGeneratorValue<T[K]>>, K & string>;
}[keyof T];

// Create a discriminated union for control results
type StreamControlResultForStreams<T extends Record<string, AsyncGenerator<unknown>>> = {
  done: TaggedMessagesUnion<T>[];
  takeMore: (keyof T)[];
};

export async function* mergeGenerators<T extends Record<string, AsyncGenerator<unknown>>>(
  streams: T,
  options: {
    isStopped?: () => boolean;
  },
): AsyncGenerator<
  TaggedMessagesUnion<T>[],
  TaggedMessagesUnion<T>[],
  StreamControlResultForStreams<T> | undefined
> {
  // Track active streams and their current messages
  const activeStreams: {
    streamName: string;
    generator: AsyncGenerator<unknown>;
    fetchPromise?: Promise<boolean>;
  }[] = [];
  const streamMessages: { streamName: string; messages: TaggedMessagesUnion<T>[] }[] = [];

  // Initialize streams
  for (const [streamName, generator] of Object.entries(streams)) {
    activeStreams.push({ streamName, generator });
    streamMessages.push({ streamName, messages: [] });
  }

  async function triggerNextMessagesForStream(streamName: string): Promise<boolean> {
    const streamEntry = activeStreams.find((s) => s.streamName === streamName);
    if (!streamEntry) {
      return false;
    }

    if (streamEntry.fetchPromise) {
      return streamEntry.fetchPromise;
    }

    const fetchPromise = (async (): Promise<boolean> => {
      try {
        const result = await streamEntry.generator.next();

        if (!result.done && result.value) {
          const messageEntry = streamMessages.find((s) => s.streamName === streamName);
          if (messageEntry) {
            if (Array.isArray(result.value)) {
              for (const item of result.value) {
                messageEntry.messages.push({
                  value: item,
                  streamName,
                } as TaggedMessagesUnion<T>);
              }
            } else {
              messageEntry.messages.push({
                value: result.value,
                streamName,
              } as TaggedMessagesUnion<T>);
            }
          }
          return true;
        } else {
          const streamIndex = activeStreams.findIndex((s) => s.streamName === streamName);
          if (streamIndex !== -1) {
            activeStreams.splice(streamIndex, 1);
          }
          const messageIndex = streamMessages.findIndex((s) => s.streamName === streamName);
          if (messageIndex !== -1) {
            streamMessages.splice(messageIndex, 1);
          }
          return false;
        }
      } finally {
        streamEntry.fetchPromise = undefined;
      }
    })();

    streamEntry.fetchPromise = fetchPromise;
    return fetchPromise;
  }

  async function waitForOneFetchToFinish(): Promise<void> {
    // resolve each second for the controller - maybe there are news
    const activeFetchPromises = activeStreams
      .map((s) => s.fetchPromise)
      .filter((p): p is Promise<boolean> => p !== undefined);
    await Promise.race([...activeFetchPromises, sleep(1000)]);
  }

  let control: StreamControlResultForStreams<T> | undefined = {
    done: [],
    takeMore: Object.keys(streams),
  };

  do {
    const doneByStream =
      control.done.length > 0
        ? arrayToMultiMap(control.done, (m: TaggedMessagesUnion<T>) => m.streamName as string)
        : null;

    if (doneByStream) {
      removeCachedMessagesByStream(doneByStream, streamMessages);
    }

    if (control.takeMore.length > 0) {
      control.takeMore.map((streamName) => triggerNextMessagesForStream(streamName as string));
    }

    await waitForOneFetchToFinish();

    const currentMessages: TaggedMessagesUnion<T>[] = streamMessages.flatMap((s) => s.messages);

    control = yield currentMessages;
  } while (activeStreams.length > 0 && control && !options.isStopped?.());

  return [];
}

function removeCachedMessagesByStream<T extends Record<string, AsyncGenerator<unknown>>>(
  messagesByStream: Map<string, TaggedMessagesUnion<T>[]>,
  streamMessages: Array<{ streamName: string; messages: TaggedMessagesUnion<T>[] }>,
): void {
  for (const [streamName, messagesToSkip] of messagesByStream.entries()) {
    const messageEntry = streamMessages.find((s) => s.streamName === streamName);

    if (messageEntry) {
      messageEntry.messages = messageEntry.messages.filter((m) => !messagesToSkip.includes(m));
    }
  }
}
