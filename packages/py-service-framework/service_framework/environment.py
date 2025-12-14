"""
Environment configuration parsing and validation utilities.

Provides:
- Typed parsing of environment variables into Pydantic models
- Automatic type coercion (bool, int, float, dict, list, BaseModel)
- Optional sensitive value redaction in error messages
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from re import Pattern
from typing import Any, Generic, TypeVar, Union, overload

from pydantic import BaseModel, Field, ValidationError

# ---------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------

SENSITIVE_PATTERNS: list[Pattern[str]] = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"key", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"credential", re.IGNORECASE),
    re.compile(r"auth", re.IGNORECASE),
]

# ---------------------------------------------------------------------
# Base schema
# ---------------------------------------------------------------------


class DefaultEnv(BaseModel):
    """Base environment configuration schema.

    All custom environment models must extend this class to guarantee
    PROCESS_NAME and NODE_ENV are available.
    """

    PROCESS_NAME: str = Field(..., min_length=1, description="Name of the process")
    NODE_ENV: str | None = Field(default="development", description="Environment name")
    PORT: int = Field(default=6000, ge=1024, le=65535, description="HTTP port number")


T = TypeVar("T", bound=DefaultEnv)

# ---------------------------------------------------------------------
# Error structures
# ---------------------------------------------------------------------


@dataclass
class EnvValidationError:
    """Validation error for an environment variable."""

    path: str
    message: str
    value: Any = None

    def __str__(self) -> str:
        val = f" (value={self.value!r})" if self.value is not None else ""
        return f"{self.path}: {self.message}{val}"


@dataclass
class ParsedEnv(Generic[T]):
    """Result of environment parsing and validation."""

    config: T
    errors: list[EnvValidationError] | None = None

    @property
    def is_valid(self) -> bool:
        return not self.errors


# ---------------------------------------------------------------------
# Parser configuration
# ---------------------------------------------------------------------


@dataclass
class EnvParserConfig:
    """Configuration for the environment parser."""

    redact_sensitive: bool = True
    source: dict[str, str | None] = None

    def __post_init__(self):
        if self.source is None:
            self.source = dict(os.environ)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------


def redact_value(key: str, value: Any) -> Any:
    """Mask values whose key name indicates sensitivity."""
    if any(p.search(key) for p in SENSITIVE_PATTERNS):
        return "[REDACTED]"
    return value


def _unwrap_optional_type(tp: type[Any]) -> type[Any]:
    """Extract the inner type from Optional[T]."""
    if hasattr(tp, "__origin__") and tp.__origin__ is Union:
        args = [a for a in tp.__args__ if a is not type(None)]
        if args:
            return args[0]
    return tp


def coerce_environment_value(value: str | None, target_type: type[Any]) -> Any:
    """Convert an environment string to the appropriate Python type."""
    if value in (None, ""):
        return None

    target_type = _unwrap_optional_type(target_type)

    try:
        if target_type is bool:
            lower = value.lower()
            if lower in {"true", "1", "yes", "on"}:
                return True
            if lower in {"false", "0", "no", "off"}:
                return False
            raise ValueError(f'Cannot interpret "{value}" as boolean')

        if target_type is int:
            return int(value)
        if target_type is float:
            return float(value)

        if target_type in (dict, list):
            return json.loads(value)

        if isinstance(target_type, type) and issubclass(target_type, BaseModel):
            return target_type.model_validate_json(value)

        return value
    except Exception as e:
        raise ValueError(f"Failed to coerce '{value}' to {target_type}: {e}") from e


def format_validation_errors(errors: list[EnvValidationError], redact_sensitive: bool) -> str:
    """Format EnvValidationError list into a readable multiline string."""
    lines = ["Environment configuration validation failed:"]
    for err in errors:
        val = redact_value(err.path, err.value) if redact_sensitive else err.value
        val_part = f", got {json.dumps(val)}" if val is not None else ""
        lines.append(f"  - {err.path}: {err.message}{val_part}")
    return "\n".join(lines)


def convert_pydantic_errors(
    exc: ValidationError, source: dict[str, Any], redact: bool
) -> list[EnvValidationError]:
    """Convert Pydantic ValidationError details to EnvValidationError objects."""
    results: list[EnvValidationError] = []
    for err in exc.errors():
        path = ".".join(str(x) for x in err["loc"]) or "root"

        # Retrieve failing value from source
        val: Any = source
        for part in err["loc"]:
            if isinstance(val, dict):
                val = val.get(part)
            else:
                val = None
                break

        if redact:
            val = redact_value(path, val)

        results.append(EnvValidationError(path, err["msg"], val))
    return results


# ---------------------------------------------------------------------
# Core parser
# ---------------------------------------------------------------------


class EnvParser:
    """Parse and validate environment variables into a Pydantic model."""

    def _coerce_source(
        self, source: dict[str, str | None], model: type[DefaultEnv]
    ) -> dict[str, Any]:
        """Coerce environment variable strings based on model field types."""
        result: dict[str, Any] = {}
        for name, field in model.model_fields.items():
            if name not in source:
                continue
            raw = source[name]
            if raw in (None, ""):
                continue
            try:
                result[name] = coerce_environment_value(raw, field.annotation)
            except Exception:
                result[name] = raw  # fallback; let Pydantic handle it
        return result

    def validate(
        self, model: type[T], source: dict[str, Any], config: EnvParserConfig
    ) -> ParsedEnv[T]:
        """Validate without throwing exceptions."""
        try:
            cfg = model.model_validate(source)
            return ParsedEnv(cfg, None)
        except ValidationError as e:
            errs = convert_pydantic_errors(e, source, config.redact_sensitive)
            try:
                dummy = model.model_construct(**source)
            except Exception:
                dummy = model.model_construct()
            return ParsedEnv(dummy, errs)

    def parse(self, model: type[T], config: EnvParserConfig | None = None) -> T:
        """Parse environment into a validated model (raises on validation error)."""
        config = config or EnvParserConfig()
        source = config.source
        coerced = self._coerce_source(source, model)
        result = self.validate(model, coerced, config)

        if result.errors:
            raise ValueError(format_validation_errors(result.errors, config.redact_sensitive))
        return result.config


# ---------------------------------------------------------------------
# Public factory helpers
# ---------------------------------------------------------------------


def create_env_parser() -> EnvParser:
    return EnvParser()


@overload
def create_env_context(model: type[T], config: EnvParserConfig | None = None) -> T: ...
@overload
def create_env_context(model: None = None, config: EnvParserConfig | None = None) -> DefaultEnv: ...


def create_env_context(
    model: type[T] | None = None,
    config: EnvParserConfig | None = None,
) -> T | DefaultEnv:
    """Create a typed environment configuration context."""
    parser = EnvParser()
    if model is None:
        return parser.parse(DefaultEnv, config)

    if not issubclass(model, DefaultEnv):
        raise TypeError(
            f"{model.__name__} must extend DefaultEnv (must define PROCESS_NAME and NODE_ENV)."
        )
    return parser.parse(model, config)
