## Monorepo: Hybrid Node.js + Python

This monorepo contains both Node.js and Python services, managed via pnpm workspace.

### Node.js Setup

#### Install

```bash
corepack enable
corepack prepare pnpm@9.12.2 --activate
pnpm install
```
#### Develop

```bash
pnpm dev
```

#### Build

```bash
pnpm build
```

#### Start Node.js servers

```bash
pnpm --filter public-api start
pnpm --filter external-bridge start
```

### Python Setup

#### Install UV (Python Package Manager)

UV is a fast, modern Python package manager (10-100x faster than pip):

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Verify installation
uv --version
```

After installation, restart your terminal or source the environment:

```bash
# macOS/Linux
source $HOME/.cargo/env
```

#### Setup Python Services

```bash
# Setup specific Python service
pnpm --filter 'py-predictor' setup

# Or setup all Python services
pnpm --filter './apps/py-*' setup
pnpm --filter './packages/*-py' setup
```

This creates a virtual environment (`.venv`) in each Python package and installs dependencies.

#### Run Python Services

```bash
# Start py-predictor service
pnpm --filter 'py-predictor' dev

# Or run directly with UV
cd apps/py-predictor
uv run python src/main.py
```

#### Python Development Commands

```bash
# Lint Python code
pnpm --filter 'py-predictor' lint

# Format Python code
pnpm --filter 'py-predictor' format

# Clean Python artifacts
pnpm --filter 'py-predictor' clean
```

### Services

**Node.js Services:**

- `coordinator` - Process coordinator
- `external-bridge` - External data bridge
- `internal-bridge` - Internal data bridge

**Python Services:**

- `py-predictor` - Python predictor service with process lifecycle management

### Quick Start (Python)

For detailed Python service setup, see `apps/py-predictor/QUICKSTART.md`

```bash
# 1. Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Setup Python service
pnpm --filter 'py-predictor' setup

# 3. Run Python service
pnpm --filter 'py-predictor' dev
```

## Data

How to read data manually from storage

```sh
rocksdb_ldb dump --db=/Users/e/taltech/loputoo/start/storage/external-bridge/binance/ws_trade/btc_usdt -> dump.txt
```
