"""Service Framework for Python.

A Python framework for building production-ready services with:
- Process lifecycle management
- Graceful shutdown handling
- Signal handling
- Diagnostic context and logging
- Environment configuration parsing and validation
- HTTP server with health checks and metrics
- Prometheus metrics collection
"""

from .diagnostics import (
    CorrelationIdGenerator,
    DiagnosticConfig,
    DiagnosticContext,
    LogEntry,
    Logger,
    LogOutputFormat,
    LogSeverity,
    create_correlation_id_generator,
    create_diagnostic_context,
    create_logger,
)
from .environment import (
    DefaultEnv,
    EnvParser,
    EnvParserConfig,
    EnvValidationError,
    ParsedEnv,
    create_env_context,
    create_env_parser,
)
from .http_server import (
    HealthCheckFn,
    HealthCheckResult,
    HttpServer,
    HttpServerConfig,
    HttpServerEnv,
    ServiceContext,
    create_http_server,
)
from .metrics_context import (
    MetricConfig,
    MetricConfigCounter,
    MetricConfigGauge,
    MetricConfigHistogram,
    MetricConfigSummary,
    MetricsConfig,
    MetricsContext,
    create_metrics_context,
)
from .process_lifecycle import (
    ProcessLifecycleConfig,
    ProcessLifecycleContext,
    ShutdownConfiguration,
    start_process_lifecycle,
)

__all__ = [
    # Process lifecycle
    "ProcessLifecycleContext",
    "start_process_lifecycle",
    "ProcessLifecycleConfig",
    "ShutdownConfiguration",
    # Environment
    "EnvParser",
    "EnvParserConfig",
    "EnvValidationError",
    "ParsedEnv",
    "create_env_context",
    "create_env_parser",
    "DefaultEnv",
    # Diagnostics
    "Logger",
    "CorrelationIdGenerator",
    "LogEntry",
    "DiagnosticConfig",
    "DiagnosticContext",
    "LogSeverity",
    "LogOutputFormat",
    "create_logger",
    "create_correlation_id_generator",
    "create_diagnostic_context",
    # HTTP Server
    "HttpServer",
    "HttpServerConfig",
    "HttpServerEnv",
    "ServiceContext",
    "HealthCheckResult",
    "HealthCheckFn",
    "create_http_server",
    # Metrics
    "MetricsContext",
    "MetricsConfig",
    "MetricConfig",
    "MetricConfigCounter",
    "MetricConfigGauge",
    "MetricConfigHistogram",
    "MetricConfigSummary",
    "create_metrics_context",
]

__version__ = "0.1.0"
