"""
Diagnostics and logging utilities for the service framework.

Provides structured logging with correlation IDs, multiple output formats,
and severity-based filtering.
"""

from __future__ import annotations

import json
import sys
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, Protocol, TypeAlias, cast

from pydantic import BaseModel

# ---------------------------------------------------------------------
# Types & constants
# ---------------------------------------------------------------------

LogSeverity = Literal["debug", "info", "warn", "error", "fatal"]
LogOutputFormat = Literal["json", "human", "structured-text"]

SEVERITY_LEVELS: dict[LogSeverity, int] = {
    "debug": 0,
    "info": 1,
    "warn": 2,
    "error": 3,
    "fatal": 4,
}

# ANSI colors
RESET = "\x1b[0m"
COLORS = {
    "debug": "\x1b[36m",
    "info": "\x1b[32m",
    "warn": "\x1b[33m",
    "error": "\x1b[31m",
    "fatal": "\x1b[35m",
    "msg": "\x1b[34m",
}

SCOPE_DELIMITER = "."

# ---------------------------------------------------------------------
# Protocols
# ---------------------------------------------------------------------


class Logger(Protocol):
    """Logger interface used throughout the framework."""

    def debug(self, message: str, fields: dict[str, Any] | None = None) -> None: ...
    def info(self, message: str, fields: dict[str, Any] | None = None) -> None: ...
    def warn(self, message: str, fields: dict[str, Any] | None = None) -> None: ...
    def error(
        self,
        error: Exception | None,
        message: str | dict[str, Any] = "",
        fields: dict[str, Any] | None = None,
    ) -> None: ...
    def fatal(
        self,
        error: Exception | None,
        message: str | dict[str, Any] = "",
        fields: dict[str, Any] | None = None,
    ) -> None: ...
    def create_child(self, scope_id: str) -> Logger: ...


class CorrelationIdGenerator(Protocol):
    """Interface for generating hierarchical correlation IDs."""

    def generate_root_id(self) -> str: ...
    def create_scoped_id(self, parent_id: str, scope: str) -> str: ...
    def extract_root_id(self, scoped_id: str) -> str: ...


class DiagnosticContext(Protocol):
    """Holds logger and correlation ID generator for a given process context."""

    correlation_id_generator: CorrelationIdGenerator
    logger: Logger

    def create_child_logger(self, correlation_id: str) -> Logger: ...
    def get_child_diagnostic_context(
        self,
        default_logger_args: dict[str, Any] | None = None,
        scope_id: str | None = None,
    ) -> DiagnosticContext: ...


# ---------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------


@dataclass
class LogEntry:
    """Immutable structured log entry."""

    timestamp: str
    severity: LogSeverity
    message: str
    service_name: str
    correlation_id: str | None = None
    fields: dict[str, Any] = field(default_factory=dict)


@dataclass
class DiagnosticConfig:
    """Configuration for diagnostics."""

    minimum_severity: LogSeverity = "info"
    output_format: LogOutputFormat = "human"
    correlation_id: str | None = None
    default_logger_args: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------
# Correlation IDs
# ---------------------------------------------------------------------


class _CorrelationIdGenerator:
    def generate_root_id(self) -> str:
        return f"req-{uuid.uuid4()}"

    def create_scoped_id(self, parent_id: str, scope: str) -> str:
        return f"{parent_id}{SCOPE_DELIMITER}{scope}"

    def extract_root_id(self, scoped_id: str) -> str:
        idx = scoped_id.find(SCOPE_DELIMITER)
        return scoped_id if idx == -1 else scoped_id[:idx]


def create_correlation_id_generator() -> CorrelationIdGenerator:
    return _CorrelationIdGenerator()


# ---------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------


def _serialize_field(value: Any) -> str:
    return json.dumps(value) if isinstance(value, (dict, list)) else f'"{value}"'


def format_log_entry(entry: LogEntry, fmt: LogOutputFormat) -> str:
    """Render a log entry into the desired output format."""
    if fmt == "json":
        data = {
            "timestamp": entry.timestamp,
            "severity": entry.severity,
            "message": entry.message,
            "serviceName": entry.service_name,
            "fields": entry.fields,
        }
        if entry.correlation_id:
            data["correlationId"] = entry.correlation_id
        return json.dumps(data)

    if fmt == "structured-text":
        parts = [
            f"timestamp={entry.timestamp}",
            f"service_name={entry.service_name}",
            f"severity={entry.severity}",
            f'message="{entry.message}"',
        ]
        if entry.correlation_id:
            parts.append(f"correlation_id={entry.correlation_id}")
        for k, v in entry.fields.items():
            parts.append(f"{k}={_serialize_field(v)}")
        return " ".join(parts)

    # human-readable default
    color = COLORS[entry.severity]
    parts = [
        f"{color}{entry.severity}{RESET}",
        f'process="{COLORS["msg"]}{entry.service_name}{RESET}"',
        f'ts="{COLORS["msg"]}{entry.timestamp}{RESET}"',
        f'msg="{color}{entry.message}{RESET}"',
    ]
    for k, v in entry.fields.items():
        parts.append(f"\n\t{k}={color}{_serialize_field(v)}{RESET}")
    return " ".join(parts)


def format_error_as_params(error: Exception | None) -> dict[str, Any]:
    if error is None:
        return {}
    try:
        tb = getattr(error, "__traceback__", None)
        params = {"name": type(error).__name__}
        if tb:
            params["stack"] = "".join(traceback.format_exception(type(error), error, tb))
        if callable(getattr(error, "to_error_plain_object", None)):
            params.update(error.to_error_plain_object())
        return params
    except Exception as e:
        return {"name": f"FormattingError({type(error).__name__})", "stack": str(e)}


# ---------------------------------------------------------------------
# Logger implementation
# ---------------------------------------------------------------------


class _Logger:
    def __init__(self, service: str, corr_id: str | None, config: DiagnosticConfig):
        self.service = service
        self.corr_id = corr_id
        self.cfg = config
        self.min_level = SEVERITY_LEVELS[config.minimum_severity]

    def _emit(self, severity: LogSeverity, message: str, fields: dict[str, Any] | None):
        if SEVERITY_LEVELS[severity] < self.min_level:
            return

        entry = LogEntry(
            timestamp=datetime.now(UTC).isoformat(),
            severity=severity,
            message=message,
            service_name=self.service,
            correlation_id=self.corr_id,
            fields={**self.cfg.default_logger_args, **(fields or {})},
        )

        out = format_log_entry(entry, self.cfg.output_format)
        stream = sys.stderr if severity in ("error", "fatal") else sys.stdout
        print(out, file=stream)

    # public logging methods
    def debug(self, msg: str, fields: dict[str, Any] | None = None):
        self._emit("debug", msg, fields)

    def info(self, msg: str, fields: dict[str, Any] | None = None):
        self._emit("info", msg, fields)

    def warn(self, msg: str, fields: dict[str, Any] | None = None):
        self._emit("warn", msg, fields)

    def error(
        self,
        err: Exception | None,
        msg: str | dict[str, Any] = "",
        fields: dict[str, Any] | None = None,
    ):
        """Log error with structured fields."""
        payload = fields if isinstance(msg, str) else (msg or {})
        payload = payload or {}  # ← ensure always a dict
        message = str(err) if err else (msg if isinstance(msg, str) else "Error occurred")
        self._emit("error", message, {**format_error_as_params(err), **payload})

    def fatal(
        self,
        err: Exception | None,
        msg: str | dict[str, Any] = "",
        fields: dict[str, Any] | None = None,
    ):
        """Log fatal error with structured fields."""
        payload = fields if isinstance(msg, str) else (msg or {})
        payload = payload or {}  # ← ensure always a dict
        message = str(err) if err else (msg if isinstance(msg, str) else "Fatal error")
        self._emit("fatal", message, {**format_error_as_params(err), **payload})

    def create_child(self, scope: str) -> Logger:
        corr = f"{self.corr_id}.{scope}" if self.corr_id else scope
        return create_logger(self.service, corr, self.cfg)


# ---------------------------------------------------------------------
# Factory functions
# ---------------------------------------------------------------------


def create_logger(service: str, corr_id: str | None, cfg: DiagnosticConfig | None = None) -> Logger:
    return _Logger(service, corr_id, cfg or DiagnosticConfig())


# ---------------------------------------------------------------------
# Diagnostic context
# ---------------------------------------------------------------------


class _DiagnosticContext:
    def __init__(self, service: str, cfg: DiagnosticConfig):
        self.service = service
        self.cfg = cfg
        self.correlation_id_generator = create_correlation_id_generator()
        self.root_id = cfg.correlation_id or self.correlation_id_generator.generate_root_id()
        self.logger = create_logger(service, self.root_id, cfg)

    def create_child_logger(self, corr_id: str) -> Logger:
        return create_logger(self.service, corr_id, self.cfg)

    def get_child_diagnostic_context(
        self, default_logger_args: dict[str, Any] | None = None, scope_id: str | None = None
    ) -> DiagnosticContext:
        new_corr = f"{scope_id}::{self.root_id}" if scope_id else self.root_id
        new_cfg = DiagnosticConfig(
            minimum_severity=self.cfg.minimum_severity,
            output_format=self.cfg.output_format,
            correlation_id=new_corr,
            default_logger_args={**self.cfg.default_logger_args, **(default_logger_args or {})},
        )
        return _DiagnosticContext(self.service, new_cfg)


# ---------------------------------------------------------------------
# Context factory
# ---------------------------------------------------------------------


def create_diagnostic_context(
    env: BaseModel, cfg: DiagnosticConfig | None = None
) -> DiagnosticContext:
    if not hasattr(env, "PROCESS_NAME"):
        raise ValueError("env_context must have PROCESS_NAME attribute")
    return _DiagnosticContext(env.PROCESS_NAME, cfg or DiagnosticConfig())
