# VictoriaMetrics Monitoring

VictoriaMetrics time-series database for monitoring infrastructure metrics from the Market Data Simulator and other services.

## Overview

VictoriaMetrics is a fast, cost-effective monitoring solution that:
- Stores time-series metrics from Prometheus-compatible endpoints
- Provides a built-in UI (vmui) for querying and visualizing metrics
- Runs as a single binary with no external dependencies
- Supports Prometheus query language (PromQL)

## Installation

Download the VictoriaMetrics binary for your platform:

```bash
pnpm install
pnpm download:vm
```

This will download the appropriate binary to `./bin/victoria-metrics-prod`.

Alternatively, download manually from: https://github.com/VictoriaMetrics/VictoriaMetrics/releases

## Configuration

### Prometheus Scrape Configuration

The `prometheus.yml` file configures which services VictoriaMetrics scrapes for metrics:

- **mds-fetcher** (port 3000): Market data fetcher service metrics
- **mds-rest-api** (port 3002): REST API service metrics
- **mds-storage** (port 3001): Storage service metrics
- **victoriametrics** (port 8428): VictoriaMetrics self-monitoring

### Storage Configuration

- **Data Directory**: `./data` - Time-series data storage
- **Retention Period**: 12 months
- **HTTP Port**: 8428

## Running with PM2

VictoriaMetrics is configured to run via PM2 in the development environment:

```bash
cd ../../process-manager/dev
pm2 start ecosystem.config.js
```

This starts VictoriaMetrics alongside other services.

## Manual Start

To run VictoriaMetrics manually:

```bash
# With Prometheus scraping
pnpm start:scrape

# Or basic start
pnpm start
```

## Accessing the UI

Once running, access the VictoriaMetrics UI at:

- **vmui**: http://localhost:8428/vmui
- **Metrics endpoint**: http://localhost:8428/metrics
- **API**: http://localhost:8428/api/v1/query

## Example Queries

Query examples for vmui:

### Request Rate by Service
```promql
rate(mds_fetcher_http_requests_total[5m])
```

### Fetcher Operations
```promql
rate(mds_fetcher_fetch_counter_total[1m])
```

### HTTP Request Duration (95th percentile)
```promql
histogram_quantile(0.95, rate(mds_fetcher_http_request_duration_seconds_bucket[5m]))
```

### Active Symbols Being Monitored
```promql
mds_fetcher_active_symbols_gauge
```

### Process CPU Usage
```promql
rate(mds_fetcher_process_cpu_user_seconds_total[5m])
```
## References

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [VictoriaMetrics GitHub](https://github.com/VictoriaMetrics/VictoriaMetrics)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
