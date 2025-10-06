# Perses Dashboard Setup

Perses dashboards for monitoring VictoriaMetrics and Node.js processes.

## Quick Setup

### 1. Download Perses Binaries

```bash
pnpm perses:download
```

This downloads Perses v0.52.0 (server and percli) to `bin/`.

### 2. Start Services

```bash
pnpm pm2:dev:monitoring  # From monorepo root
```

This starts:
- Perses on http://localhost:8080
- VictoriaMetrics on http://localhost:8428

### 3. Complete Setup (One Command)

```bash
pnpm perses:setup
```

This automatically:
- Logs into Perses via `percli`
- Builds all dashboards from CUE definitions
- Deploys datasource, project, and dashboards

## Available Dashboards

- **MDS Fetcher**: Market data simulator fetcher metrics
- **Node.js Process**: System metrics (CPU, memory, event loop) with job filtering

## Manual Steps (Optional)

If you prefer to run steps individually:

```bash
pnpm perses:login      # Login to Perses
pnpm dac:setup         # Setup CUE SDK (first time only, when no dac folder present)
pnpm dac:build         # Build dashboards
pnpm dac:apply         # Deploy to Perses
```

See `dac/README.md` for detailed Dashboard-as-Code documentation.

