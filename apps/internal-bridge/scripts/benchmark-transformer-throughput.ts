#!/usr/bin/env tsx

import { createZmqSubscriber, zmqSocketTempalatesUnifiedData } from '@krupton/messaging-node';
import { StorageRecord } from '@krupton/persistent-storage-node';
import { UnifiedTrade } from '@krupton/persistent-storage-node/transformed';
import { SF } from '@krupton/service-framework-node';
import { createBinanceTradesTransformerContext } from '../src/process/transformer/binanceTrades/transformerContext.js';
import { startBinanceTradesTransformerWorker } from '../src/process/transformer/binanceTrades/transformerProcess.js';

import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_SYMBOL = 'btc_usdt';
const MEASUREMENT_DURATION_MS = 30000; 
const REPORT_INTERVAL_MS = 5000;

const CHECKPOINT_PATH = join(process.cwd(), '../../storage/internal-bridge/binance/transformer/binance_ws_trades', TEST_SYMBOL);

if (existsSync(CHECKPOINT_PATH)) {
  console.log(`Removing checkpoint state: ${CHECKPOINT_PATH}`);
  rmSync(CHECKPOINT_PATH, { recursive: true, force: true });
  console.log('Checkpoint removed\n');
}

process.env.PROCESS_NAME = 'benchmark-transformer';
process.env.NODE_ENV = 'development';
process.env.PORT = '9999';
process.env.LOG_LEVEL = 'warn';
process.env.SYMBOLS = TEST_SYMBOL;

async function benchmarkTransformerThroughput() {
  console.log('Benchmark: Internal Bridge Transformer Throughput');
  console.log(`Symbol: ${TEST_SYMBOL}`);
  console.log(`Measurement duration: ${MEASUREMENT_DURATION_MS / 1000}s\n`);

  let transformerContext: ReturnType<typeof createBinanceTradesTransformerContext> | null = null;
  let subscriber: ReturnType<typeof createZmqSubscriber<StorageRecord<UnifiedTrade>>> | null = null;

  const stats = {
    messagesReceived: 0,
    startTime: 0,
    lastReportTime: 0,
    lastReportCount: 0,
  };

  try {
    await SF.startProcessLifecycle(async (processContext) => {
      console.log('Starting transformer...');
      
      transformerContext = createBinanceTradesTransformerContext(processContext);
      
      transformerContext.diagnosticContext = SF.createDiagnosticContext(
        transformerContext.envContext,
        { minimumSeverity: 'warn' }
      );

      for (const consumer of Object.values(transformerContext.inputConsumers)) {
        consumer.connect([TEST_SYMBOL]);
      }
      
      console.log(`Connecting producer to: binance-${TEST_SYMBOL}`);
      await transformerContext.producers.unifiedTrade.connect([`binance-${TEST_SYMBOL}`]);
      console.log('Producer connected');

      transformerContext.inputConsumers.binanceTradeWs.receive = async function *() {
        yield []
      }

      await startBinanceTradesTransformerWorker(transformerContext, TEST_SYMBOL);

      console.log('Transformer started');
      console.log('Creating subscriber...\n');

      const socket = zmqSocketTempalatesUnifiedData.trade(`binance-${TEST_SYMBOL}`);
      subscriber = createZmqSubscriber<StorageRecord<UnifiedTrade>>({
        socket,
        diagnosticContext: transformerContext.diagnosticContext,
      });

      await subscriber.connect();
      console.log(`Subscribed to: ${socket}`);
      console.log('Waiting for messages...\n');

      stats.startTime = Date.now();
      stats.lastReportTime = stats.startTime;

      const reportInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - stats.startTime;
        const sinceLastReport = now - stats.lastReportTime;
        const messagesSinceLastReport = stats.messagesReceived - stats.lastReportCount;
        
        const currentThroughput = (messagesSinceLastReport / sinceLastReport) * 1000;
        const overallThroughput = (stats.messagesReceived / elapsed) * 1000;
        
        console.log(
          `[${(elapsed / 1000).toFixed(1)}s] ` +
          `Total: ${stats.messagesReceived.toLocaleString()} msgs | ` +
          `Current: ${Math.round(currentThroughput).toLocaleString()} msg/s | ` +
          `Overall: ${Math.round(overallThroughput).toLocaleString()} msg/s`
        );
        
        stats.lastReportTime = now;
        stats.lastReportCount = stats.messagesReceived;
      }, REPORT_INTERVAL_MS);

      (async () => {
        for await (const messages of subscriber!.receive()) {
          stats.messagesReceived += messages.length;
          
          if (Date.now() - stats.startTime >= MEASUREMENT_DURATION_MS) {
            clearInterval(reportInterval);
            break;
          }
        }
      })();

      await new Promise(resolve => setTimeout(resolve, MEASUREMENT_DURATION_MS + 500));
      
      clearInterval(reportInterval);
      
      const totalElapsed = Date.now() - stats.startTime;
      const overallThroughput = (stats.messagesReceived / totalElapsed) * 1000;
      
      console.log('\n' + '='.repeat(80));
      console.log('BENCHMARK RESULTS');
      console.log('='.repeat(80));
      console.log();
      console.log(`Symbol:                ${TEST_SYMBOL}`);
      console.log(`Duration:              ${(totalElapsed / 1000).toFixed(1)}s`);
      console.log(`Total messages:        ${stats.messagesReceived.toLocaleString()}`);
      console.log(`Throughput:            ${Math.round(overallThroughput).toLocaleString()} msg/s`);
      console.log(`Avg latency:           ${((totalElapsed * 1000) / stats.messagesReceived).toFixed(3)} μs per message`);
      console.log('='.repeat(80));
      
      await processContext.shutdown();

      return {
        diagnosticContext: transformerContext!.diagnosticContext,
        envContext: transformerContext!.envContext,
      };
    });

  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  } finally {
    subscriber?.close();
  }
}

benchmarkTransformerThroughput();

