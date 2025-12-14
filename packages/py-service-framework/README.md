# Service Framework for Python

## Environment Context

Create a context with parsed configuration and environment:

```python
from pydantic import BaseModel, Field
from typing import Literal

class AdvancedConfig(BaseModel):
    # Required fields
    SERVICE_NAME: str = Field(min_length=1, max_length=100)
    
    # Numeric constraints
    PORT: int = Field(ge=1024, le=65535, default=3000)
    WORKERS: int = Field(ge=1, le=100, default=4)
    
    # Enums with literals
    LOG_LEVEL: Literal["debug", "info", "warning", "error"] = "info"
    NODE_ENV: Literal["development", "production", "test"] = "development"
    
    # Optional fields
    DATABASE_URL: str | None = None
    REDIS_URL: str | None = None
    
    # Patterns
    API_VERSION: str = Field(pattern=r"^v\d+$", default="v1")
    
    # Default values
    ENABLE_METRICS: bool = True
    REQUEST_TIMEOUT: float = 30.0
```

## Process Lifecycle Management

(Documentation for process lifecycle features would go here)

## Development

### Setup

```bash
# Create virtual environment and install dependencies
pnpm --filter 'service-framework-py' run setup

# Or manually:
uv venv
uv sync
```

### Testing

```bash
# Run tests
pnpm --filter 'service-framework-py' test

# Or with uv:
uv run pytest tests/
```

### Linting

```bash
# Check code
pnpm --filter 'service-framework-py' lint

# Auto-fix issues
pnpm --filter 'service-framework-py' lint:fix

# Format code
pnpm --filter 'service-framework-py' format
```

