#!/usr/bin/env node

/**
 * Benchmark: Apache Kafka vs RocksDB + ZeroMQ
 * 
 * This script compares message throughput and latency between:
 * 1. ZeroMQ IPC (Unix domain sockets)
 * 2. ZeroMQ TCP (localhost loopback)
 * 3. Apache Kafka (KRaft mode via Docker)
 * 
 * Test scenario: 1 million messages using Binance trade stream format
 */

import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Kafka } from 'kafkajs';
import zmq from 'zeromq';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const { SegmentedLog } = require('../packages/rust-rocksdb-napi/index.js');

const TEST_MESSAGE_COUNT = 1_000_000;
const WARMUP_MESSAGES = 10_000;
const LATENCY_SAMPLE_RATE = 100;
const MESSAGE_SIZE = 256; // bytes
const KAFKA_CONTAINER_NAME = 'benchmark-kafka';
const KAFKA_PORT = 29092;
const ZMQ_PORT = 5555;
const ZMQ_PURE_IPC_PATH = 'ipc:///tmp/benchmark-zeromq-pure.ipc';
const ZMQ_BINARY_IPC_PATH = 'ipc:///tmp/benchmark-zeromq-binary.ipc';
const ZMQ_IPC_PATH = 'ipc:///tmp/benchmark-zeromq.ipc';
const ROCKSDB_PATH = join(process.cwd(), 'tmp', 'benchmark-rocksdb');

// Mock trade message based on Binance TradeStream schema
const MOCK_TRADE_MESSAGE = {
  stream: 'btcusdt@trade',
  data: {
    e: 'trade',
    E: Date.now(),
    s: 'BTCUSDT',
    t: 12345,
    p: '50000.00',
    q: '0.01',
    T: Date.now(),
    m: true,
    M: true,
  },
};

// ============================================================================
// Kafka Setup
// ============================================================================

async function startKafkaContainer() {
  console.log('Starting Kafka container (KRaft mode)...');
  
  try {
    // Stop and remove existing container if it exists
    try {
      execSync(`docker stop ${KAFKA_CONTAINER_NAME}`, { stdio: 'ignore' });
      execSync(`docker rm ${KAFKA_CONTAINER_NAME}`, { stdio: 'ignore' });
    } catch {
      // Container doesn't exist, that's fine
    }

    // Start Kafka in KRaft mode (no Zookeeper needed)
    const dockerCmd = `docker run -d \
      --name ${KAFKA_CONTAINER_NAME} \
      -p ${KAFKA_PORT}:${KAFKA_PORT} \
      -e KAFKA_NODE_ID=1 \
      -e KAFKA_PROCESS_ROLES=broker,controller \
      -e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:${KAFKA_PORT},CONTROLLER://0.0.0.0:9093 \
      -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:${KAFKA_PORT} \
      -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
      -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
      -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
      -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
      -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
      -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
      -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
      -e KAFKA_NUM_PARTITIONS=1 \
      -e CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk \
      apache/kafka:latest`;

    execSync(dockerCmd, { stdio: 'inherit' });
    console.log('Kafka container started');

    // Wait for Kafka to be ready
    console.log('Waiting for Kafka to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Verify Kafka is responding
    let retries = 30;
    while (retries > 0) {
      try {
        const kafka = new Kafka({
          clientId: 'benchmark-check',
          brokers: [`localhost:${KAFKA_PORT}`],
          requestTimeout: 5000,
        });
        const admin = kafka.admin();
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        console.log('Kafka is ready');
        return;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('Kafka failed to start properly');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Failed to start Kafka:', error);
    throw error;
  }
}

async function stopKafkaContainer() {
  console.log('Stopping and removing Kafka container...');
  try {
    execSync(`docker stop ${KAFKA_CONTAINER_NAME}`, { stdio: 'ignore' });
    execSync(`docker rm ${KAFKA_CONTAINER_NAME}`, { stdio: 'ignore' });
    console.log('Kafka container removed');
  } catch (error) {
    console.error(' Failed to stop Kafka container:', error);
  }
}

// ============================================================================
// Kafka Benchmark
// ============================================================================

async function benchmarkKafka() {
  console.log('\nBenchmarking Kafka...');
  
  const kafka = new Kafka({
    clientId: 'benchmark-producer',
    brokers: [`localhost:${KAFKA_PORT}`],
  });

  const admin = kafka.admin();
  await admin.connect();
  
  // Create topic
  const topic = 'benchmark-trades';
  try {
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
    });
  } catch {
    // Topic might already exist
  }
  await admin.disconnect();

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'benchmark-group' });

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  const latencies = [];
  let receivedCount = 0;

  // Consumer
  const consumerPromise = new Promise((resolve) => {
    consumer.run({
      eachMessage: async ({ message }) => {
        const endTime = process.hrtime.bigint();
        const data = JSON.parse(message.value.toString());
        
        if (data.sendTime) {
          const latencyNs = Number(endTime - BigInt(data.sendTime));
          const latencyUs = latencyNs / 1000;
          latencies.push(latencyUs);
        }

        receivedCount++;
        if (receivedCount === TEST_MESSAGE_COUNT) {
          resolve();
        }
      },
    });
  });

  // Warmup
  console.log('Warming up...');
  for (let i = 0; i < WARMUP_MESSAGES; i++) {
    const message = { ...MOCK_TRADE_MESSAGE, id: `warmup-${i}`, sendTime: null };
    await producer.send({
      topic,
      messages: [{
        key: `warmup-${i}`,
        value: JSON.stringify(message),
      }],
    });
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Benchmark
  console.log(`Sending ${TEST_MESSAGE_COUNT.toLocaleString()} messages...`);
  const startTime = Date.now();

  // Send messages in batches
  const batchSize = 1000;
  for (let i = 0; i < TEST_MESSAGE_COUNT; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j < TEST_MESSAGE_COUNT; j++) {
      const messageId = `msg-${i + j}`;
      const shouldMeasureLatency = (i + j) % LATENCY_SAMPLE_RATE === 0;
      const sendTime = shouldMeasureLatency ? Number(process.hrtime.bigint()) : null;
      const message = { ...MOCK_TRADE_MESSAGE, id: messageId, sendTime };
      
      batch.push({
        key: messageId,
        value: JSON.stringify(message),
      });
    }
    await producer.send({ topic, messages: batch });

    if ((i + batchSize) % 100000 === 0) {
      console.log(`  Sent ${(i + batchSize).toLocaleString()} messages...`);
    }
  }

  console.log('Waiting for all messages to be consumed...');
  await consumerPromise;

  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;

  await consumer.disconnect();
  await producer.disconnect();

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const medianLatencyUs = latencies[Math.floor(latencies.length / 2)];
  const p95LatencyUs = latencies[Math.floor(latencies.length * 0.95)];
  const p99LatencyUs = latencies[Math.floor(latencies.length * 0.99)];
  const throughputMsgPerSec = (TEST_MESSAGE_COUNT / totalTimeMs) * 1000;

  return {
    name: 'Apache Kafka (KRaft)',
    messageCount: TEST_MESSAGE_COUNT,
    totalTimeMs,
    throughputMsgPerSec,
    medianLatencyUs,
    p95LatencyUs,
    p99LatencyUs,
  };
}

// ============================================================================
// Pure ZeroMQ Binary Benchmark (no serialization, no storage)
// ============================================================================

async function benchmarkPureZeroMQBinary() {
  console.log('\nBenchmarking Pure ZeroMQ IPC Binary (no serialization, no storage)...');

  const publisher = new zmq.Publisher();
  await publisher.bind(ZMQ_BINARY_IPC_PATH);

  const subscriber = new zmq.Subscriber();
  subscriber.connect(ZMQ_BINARY_IPC_PATH);
  subscriber.subscribe('trades');

  const latencies = [];
  let receivedCount = 0;

  const consumerPromise = new Promise((resolve) => {
    (async () => {
      for await (const [topic, message] of subscriber) {
        const endTime = process.hrtime.bigint();
        
        // Read timestamp from last 8 bytes (little-endian BigInt64)
        const sendTime = message.readBigInt64LE(MESSAGE_SIZE - 8);
        
        if (sendTime !== 0n) {
          const latencyNs = Number(endTime - sendTime);
          const latencyUs = latencyNs / 1000;
          latencies.push(latencyUs);
        }

        receivedCount++;
        if (receivedCount === TEST_MESSAGE_COUNT) {
          resolve();
          break;
        }
      }
    })();
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Warming up...');
  const warmupBuffer = Buffer.alloc(MESSAGE_SIZE);
  for (let i = 0; i < WARMUP_MESSAGES; i++) {
    warmupBuffer.writeBigInt64LE(0n, MESSAGE_SIZE - 8);
    await publisher.send(['trades', warmupBuffer]);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`Sending ${TEST_MESSAGE_COUNT.toLocaleString()} messages...`);
  const startTime = Date.now();

  const buffer = Buffer.alloc(MESSAGE_SIZE);
  
  for (let i = 0; i < TEST_MESSAGE_COUNT; i++) {
    const shouldMeasureLatency = i % LATENCY_SAMPLE_RATE === 0;
    const sendTime = shouldMeasureLatency ? process.hrtime.bigint() : 0n;
    
    // Write timestamp to last 8 bytes (little-endian)
    buffer.writeBigInt64LE(sendTime, MESSAGE_SIZE - 8);
    
    await publisher.send(['trades', buffer]);

    if ((i + 1) % 100000 === 0) {
      console.log(`  Sent ${(i + 1).toLocaleString()} messages...`);
    }
  }

  console.log('Waiting for all messages to be consumed...');
  await consumerPromise;

  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;

  publisher.close();
  subscriber.close();

  latencies.sort((a, b) => a - b);
  const medianLatencyUs = latencies[Math.floor(latencies.length / 2)];
  const p95LatencyUs = latencies[Math.floor(latencies.length * 0.95)];
  const p99LatencyUs = latencies[Math.floor(latencies.length * 0.99)];
  const throughputMsgPerSec = (TEST_MESSAGE_COUNT / totalTimeMs) * 1000;

  return {
    name: 'Pure ZeroMQ IPC Binary',
    messageCount: TEST_MESSAGE_COUNT,
    totalTimeMs,
    throughputMsgPerSec,
    medianLatencyUs,
    p95LatencyUs,
    p99LatencyUs,
  };
}

// ============================================================================
// Pure ZeroMQ Benchmark (no storage)
// ============================================================================

async function benchmarkPureZeroMQ() {
  console.log('\nBenchmarking Pure ZeroMQ IPC (no storage)...');

  const publisher = new zmq.Publisher();
  await publisher.bind(ZMQ_PURE_IPC_PATH);

  const subscriber = new zmq.Subscriber();
  subscriber.connect(ZMQ_PURE_IPC_PATH);
  subscriber.subscribe('trades');

  const latencies = [];
  let receivedCount = 0;

  const consumerPromise = new Promise((resolve) => {
    (async () => {
      for await (const [topic, message] of subscriber) {
        const endTime = process.hrtime.bigint();
        const data = JSON.parse(message.toString());
        
        if (data.sendTime) {
          const latencyNs = Number(endTime - BigInt(data.sendTime));
          const latencyUs = latencyNs / 1000;
          latencies.push(latencyUs);
        }

        receivedCount++;
        if (receivedCount === TEST_MESSAGE_COUNT) {
          resolve();
          break;
        }
      }
    })();
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Warming up...');
  for (let i = 0; i < WARMUP_MESSAGES; i++) {
    const message = { ...MOCK_TRADE_MESSAGE, id: `warmup-${i}`, sendTime: null };
    const serialized = JSON.stringify(message);
    await publisher.send(['trades', serialized]);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`Sending ${TEST_MESSAGE_COUNT.toLocaleString()} messages...`);
  const startTime = Date.now();

  const baseMessage = JSON.stringify(MOCK_TRADE_MESSAGE);
  const baseMessageObj = JSON.parse(baseMessage);

  for (let i = 0; i < TEST_MESSAGE_COUNT; i++) {
    const messageId = `msg-${i}`;
    const shouldMeasureLatency = i % LATENCY_SAMPLE_RATE === 0;
    const sendTime = shouldMeasureLatency ? Number(process.hrtime.bigint()) : null;
    
    const message = { ...baseMessageObj, id: messageId, sendTime };
    const serialized = JSON.stringify(message);
    
    await publisher.send(['trades', serialized]);

    if ((i + 1) % 100000 === 0) {
      console.log(`  Sent ${(i + 1).toLocaleString()} messages...`);
    }
  }

  console.log('Waiting for all messages to be consumed...');
  await consumerPromise;

  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;

  publisher.close();
  subscriber.close();

  latencies.sort((a, b) => a - b);
  const medianLatencyUs = latencies[Math.floor(latencies.length / 2)];
  const p95LatencyUs = latencies[Math.floor(latencies.length * 0.95)];
  const p99LatencyUs = latencies[Math.floor(latencies.length * 0.99)];
  const throughputMsgPerSec = (TEST_MESSAGE_COUNT / totalTimeMs) * 1000;

  return {
    name: 'Pure ZeroMQ IPC',
    messageCount: TEST_MESSAGE_COUNT,
    totalTimeMs,
    throughputMsgPerSec,
    medianLatencyUs,
    p95LatencyUs,
    p99LatencyUs,
  };
}

// ============================================================================
// RocksDB + ZeroMQ Benchmark
// ============================================================================

async function benchmarkRocksDBZeroMQ(transportType = 'tcp') {
  const isTcp = transportType === 'tcp';
  const transportName = isTcp ? 'TCP' : 'IPC';
  console.log(`\nBenchmarking RocksDB + ZeroMQ (${transportName})...`);

  // Setup RocksDB
  const dbPath = join(ROCKSDB_PATH, transportType);
  if (existsSync(dbPath)) {
    rmSync(dbPath, { recursive: true, force: true });
  }
  mkdirSync(dbPath, { recursive: true });

  const db = new SegmentedLog(dbPath);

  // Setup ZeroMQ
  const publisher = new zmq.Publisher();
  const endpoint = isTcp ? `tcp://127.0.0.1:${ZMQ_PORT}` : ZMQ_IPC_PATH;
  await publisher.bind(endpoint);

  const subscriber = new zmq.Subscriber();
  subscriber.connect(endpoint);
  subscriber.subscribe('trades');

  const latencies = [];
  let receivedCount = 0;

  // Consumer
  const consumerPromise = new Promise((resolve) => {
    (async () => {
      for await (const [topic, message] of subscriber) {
        const endTime = process.hrtime.bigint();
        const data = JSON.parse(message.toString());
        
        if (data.sendTime) {
          const latencyNs = Number(endTime - BigInt(data.sendTime));
          const latencyUs = latencyNs / 1000;
          latencies.push(latencyUs);
        }

        receivedCount++;
        if (receivedCount === TEST_MESSAGE_COUNT) {
          resolve();
          break;
        }
      }
    })();
  });

  // Wait for subscriber to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Warmup
  console.log('Warming up...');
  for (let i = 0; i < WARMUP_MESSAGES; i++) {
    const message = { ...MOCK_TRADE_MESSAGE, id: `warmup-${i}`, sendTime: null };
    const serialized = JSON.stringify(message);
    db.append(Buffer.from(serialized));
    await publisher.send(['trades', serialized]);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Benchmark
  console.log(`Sending ${TEST_MESSAGE_COUNT.toLocaleString()} messages...`);
  const startTime = Date.now();

  const baseMessage = JSON.stringify(MOCK_TRADE_MESSAGE);
  const baseMessageObj = JSON.parse(baseMessage);

  for (let i = 0; i < TEST_MESSAGE_COUNT; i++) {
    const messageId = `msg-${i}`;
    const shouldMeasureLatency = i % LATENCY_SAMPLE_RATE === 0;
    const sendTime = shouldMeasureLatency ? Number(process.hrtime.bigint()) : null;
    
    const message = { ...baseMessageObj, id: messageId, sendTime };
    const serialized = JSON.stringify(message);
    const buffer = Buffer.from(serialized);
    
    db.append(buffer);
    
    await publisher.send(['trades', serialized]);

    if ((i + 1) % 100000 === 0) {
      console.log(`  Sent ${(i + 1).toLocaleString()} messages...`);
    }
  }

  console.log('Waiting for all messages to be consumed...');
  await consumerPromise;

  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;

  publisher.close();
  subscriber.close();
  db.close();

  latencies.sort((a, b) => a - b);
  const medianLatencyUs = latencies[Math.floor(latencies.length / 2)];
  const p95LatencyUs = latencies[Math.floor(latencies.length * 0.95)];
  const p99LatencyUs = latencies[Math.floor(latencies.length * 0.99)];
  const throughputMsgPerSec = (TEST_MESSAGE_COUNT / totalTimeMs) * 1000;

  return {
    name: `RocksDB + ZeroMQ (${transportName})`,
    messageCount: TEST_MESSAGE_COUNT,
    totalTimeMs,
    throughputMsgPerSec,
    medianLatencyUs,
    p95LatencyUs,
    p99LatencyUs,
  };
}

// ============================================================================
// Main
// ============================================================================

function printResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log();

  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  Messages:              ${result.messageCount.toLocaleString()}`);
    console.log(`  Total time:            ${result.totalTimeMs.toLocaleString()} ms`);
    console.log(`  Throughput:            ${Math.round(result.throughputMsgPerSec).toLocaleString()} msg/s`);
    console.log(`  Median latency:        ${Math.round(result.medianLatencyUs).toLocaleString()} μs`);
    console.log(`  P95 latency:           ${Math.round(result.p95LatencyUs).toLocaleString()} μs`);
    console.log(`  P99 latency:           ${Math.round(result.p99LatencyUs).toLocaleString()} μs`);
    console.log();
  }

    if (results.length >= 2) {
    console.log('Comparison (vs Kafka):');
    const kafka = results.find(r => r.name.includes('Kafka'));
    if (kafka) {
      for (const result of results) {
        if (result === kafka) continue;
        const latencySpeedup = kafka.medianLatencyUs / result.medianLatencyUs;
        const throughputRatio = result.throughputMsgPerSec / kafka.throughputMsgPerSec;
        console.log(`  ${result.name}:`);
        console.log(`    Latency: ${latencySpeedup.toFixed(2)}× ${latencySpeedup > 1 ? 'faster' : 'slower'}`);
        console.log(`    Throughput: ${throughputRatio.toFixed(2)}× ${throughputRatio > 1 ? 'higher' : 'lower'}`);
      }
    }
    
    const pureBinary = results.find(r => r.name.includes('Binary'));
    const pureJson = results.find(r => r.name.includes('Pure ZeroMQ IPC JSON'));
    const ipcWithStorage = results.find(r => r.name.includes('RocksDB + ZeroMQ (IPC)'));
    
    if (pureBinary && pureJson) {
      const serializationOverhead = pureJson.medianLatencyUs / pureBinary.medianLatencyUs;
      console.log(`\nSerialization overhead:`);
      console.log(`  JSON adds ${serializationOverhead.toFixed(2)}× latency overhead`);
      console.log(`  Pure Binary: ${Math.round(pureBinary.medianLatencyUs)} μs`);
      console.log(`  With JSON: ${Math.round(pureJson.medianLatencyUs)} μs`);
    }
    
    if (pureJson && ipcWithStorage) {
      const storageOverhead = ipcWithStorage.medianLatencyUs / pureJson.medianLatencyUs;
      console.log(`\nStorage overhead:`);
      console.log(`  RocksDB adds ${storageOverhead.toFixed(2)}× latency overhead`);
      console.log(`  Pure IPC JSON: ${Math.round(pureJson.medianLatencyUs)} μs`);
      console.log(`  With RocksDB: ${Math.round(ipcWithStorage.medianLatencyUs)} μs`);
    }
    
    const ipc = results.find(r => r.name.includes('IPC') && r.name.includes('RocksDB'));
    const tcp = results.find(r => r.name.includes('TCP'));
    if (ipc && tcp) {
      const ipcVsTcpLatency = tcp.medianLatencyUs / ipc.medianLatencyUs;
      const ipcVsTcpThroughput = ipc.throughputMsgPerSec / tcp.throughputMsgPerSec;
      console.log(`\nIPC vs TCP (with RocksDB):`);
      console.log(`  IPC latency: ${ipcVsTcpLatency.toFixed(2)}× ${ipcVsTcpLatency > 1 ? 'faster' : 'slower'} than TCP`);
      console.log(`  IPC throughput: ${ipcVsTcpThroughput.toFixed(2)}× ${ipcVsTcpThroughput > 1 ? 'higher' : 'lower'} than TCP`);
    }
  }

  console.log('='.repeat(80));
}

async function main() {
  console.log('Starting Kafka vs RocksDB+ZeroMQ Benchmark');
  console.log(`Test: ${TEST_MESSAGE_COUNT.toLocaleString()} messages\n`);

  const results = [];

  try {
    // Benchmark 1: Pure ZeroMQ IPC Binary (fastest)
    console.log('='.repeat(80));
    console.log('Test 1/5: Pure ZeroMQ IPC Binary (no serialization, no storage)');
    console.log('='.repeat(80));
    const pureBinaryResult = await benchmarkPureZeroMQBinary();
    results.push(pureBinaryResult);

    // Benchmark 2: Pure ZeroMQ IPC JSON
    console.log('\n' + '='.repeat(80));
    console.log('Test 2/5: Pure ZeroMQ IPC JSON (no storage)');
    console.log('='.repeat(80));
    const pureIpcResult = await benchmarkPureZeroMQ();
    results.push(pureIpcResult);

    // Benchmark 3: ZeroMQ IPC + RocksDB
    console.log('\n' + '='.repeat(80));
    console.log('Test 3/5: ZeroMQ IPC + RocksDB');
    console.log('='.repeat(80));
    const ipcResult = await benchmarkRocksDBZeroMQ('ipc');
    results.push(ipcResult);

    // Benchmark 4: ZeroMQ TCP + RocksDB
    console.log('\n' + '='.repeat(80));
    console.log('Test 4/5: ZeroMQ TCP + RocksDB');
    console.log('='.repeat(80));
    const tcpResult = await benchmarkRocksDBZeroMQ('tcp');
    results.push(tcpResult);

    // Benchmark 5: Kafka
    console.log('\n' + '='.repeat(80));
    console.log('Test 5/5: Apache Kafka');
    console.log('='.repeat(80));
    await startKafkaContainer();
    const kafkaResult = await benchmarkKafka();
    results.push(kafkaResult);

    // Print results
    printResults(results);

  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  } finally {
    await stopKafkaContainer();
    
    if (existsSync(ROCKSDB_PATH)) {
      rmSync(ROCKSDB_PATH, { recursive: true, force: true });
    }
    
    const ipcSocketPath = '/tmp/benchmark-zeromq.ipc';
    if (existsSync(ipcSocketPath)) {
      rmSync(ipcSocketPath, { force: true });
    }
  }
}

main();

