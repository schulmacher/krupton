"""Metrics context for Prometheus metrics collection.

Provides a structured way to create and manage Prometheus metrics with:
- Counter, Gauge, Histogram, and Summary metrics
- Automatic service name prefixing
- Validation of metric and label names
- Integration with environment context
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, Summary

DEFAULT_HISTOGRAM_BUCKETS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]
DEFAULT_SUMMARY_QUANTILES = [(0.5, 0.05), (0.95, 0.01), (0.99, 0.001)]


def normalize_service_name(service_name: str) -> str:
    normalized = re.sub(r"(?<!^)(?=[A-Z])", "_", service_name)
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9_]", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized)
    normalized = re.sub(r"^_|_$", "", normalized)
    return normalized


def validate_metric_name(name: str) -> None:
    if not name:
        raise ValueError("Metric name cannot be empty")

    valid_name_pattern = re.compile(r"^[a-zA-Z_:][a-zA-Z0-9_:]*$")
    if not valid_name_pattern.match(name):
        raise ValueError(
            f"Invalid metric name '{name}'. "
            "Metric names must match pattern: [a-zA-Z_:][a-zA-Z0-9_:]*"
        )


def validate_label_names(label_names: Sequence[str] | None) -> None:
    if not label_names:
        return

    valid_label_pattern = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

    for label in label_names:
        if not valid_label_pattern.match(label):
            raise ValueError(
                f"Invalid label name '{label}'. "
                "Label names must match pattern: [a-zA-Z_][a-zA-Z0-9_]*"
            )

        if label.startswith("__"):
            raise ValueError(
                f"Label name '{label}' is reserved. Label names cannot start with '__'"
            )


@dataclass
class MetricConfigCounter:
    type: Literal["counter"] = "counter"
    name: str = ""
    help: str = ""
    label_names: Sequence[str] | None = None


@dataclass
class MetricConfigGauge:
    type: Literal["gauge"] = "gauge"
    name: str = ""
    help: str = ""
    label_names: Sequence[str] | None = None


@dataclass
class MetricConfigHistogram:
    type: Literal["histogram"] = "histogram"
    name: str = ""
    help: str = ""
    label_names: Sequence[str] | None = None
    buckets: Sequence[float] | None = None


@dataclass
class MetricConfigSummary:
    type: Literal["summary"] = "summary"
    name: str = ""
    help: str = ""
    label_names: Sequence[str] | None = None
    quantiles: Sequence[tuple[float, float]] | None = None


MetricConfig = MetricConfigCounter | MetricConfigGauge | MetricConfigHistogram | MetricConfigSummary


@dataclass
class MetricsConfig:
    env_context: Any
    enable_default_metrics: bool = True
    prefix: str | None = None


class MetricsContext(Protocol):
    def get_registry(self) -> CollectorRegistry: ...

    def create_counter(
        self, name: str, help: str, label_names: Sequence[str] | None = None
    ) -> Counter: ...

    def create_gauge(
        self, name: str, help: str, label_names: Sequence[str] | None = None
    ) -> Gauge: ...

    def create_histogram(
        self,
        name: str,
        help: str,
        label_names: Sequence[str] | None = None,
        buckets: Sequence[float] | None = None,
    ) -> Histogram: ...

    def create_summary(
        self,
        name: str,
        help: str,
        label_names: Sequence[str] | None = None,
        quantiles: Sequence[tuple[float, float]] | None = None,
    ) -> Summary: ...

    def get_metrics_as_string(self) -> str: ...

    def clear_metrics(self) -> None: ...


class _MetricsContextImpl:
    def __init__(self, config: MetricsConfig) -> None:
        self.config = config
        self.registry = CollectorRegistry()

        if config.prefix:
            self.full_prefix = f"{config.prefix}_"
        else:
            process_name = config.env_context.PROCESS_NAME
            self.full_prefix = f"{normalize_service_name(process_name)}_"

        if config.enable_default_metrics:
            # TODO WTF docs stae that these should be colected by default
            # https://prometheus.github.io/client_python/collector/
            from prometheus_client import GC_COLLECTOR, PlatformCollector, ProcessCollector

            PlatformCollector(registry=self.registry)
            ProcessCollector(registry=self.registry)
            self.registry.register(GC_COLLECTOR)

    def get_registry(self) -> CollectorRegistry:
        return self.registry

    def create_counter(
        self, name: str, help: str, label_names: Sequence[str] | None = None
    ) -> Counter:
        validate_metric_name(name)
        validate_label_names(label_names)

        full_name = f"{self.full_prefix}{name}"
        return Counter(
            full_name,
            help,
            labelnames=list(label_names) if label_names else [],
            registry=self.registry,
        )

    def create_gauge(self, name: str, help: str, label_names: Sequence[str] | None = None) -> Gauge:
        validate_metric_name(name)
        validate_label_names(label_names)

        full_name = f"{self.full_prefix}{name}"
        return Gauge(
            full_name,
            help,
            labelnames=list(label_names) if label_names else [],
            registry=self.registry,
        )

    def create_histogram(
        self,
        name: str,
        help: str,
        label_names: Sequence[str] | None = None,
        buckets: Sequence[float] | None = None,
    ) -> Histogram:
        validate_metric_name(name)
        validate_label_names(label_names)

        full_name = f"{self.full_prefix}{name}"
        buckets_list = list(buckets) if buckets else DEFAULT_HISTOGRAM_BUCKETS

        return Histogram(
            full_name,
            help,
            labelnames=list(label_names) if label_names else [],
            buckets=buckets_list,
            registry=self.registry,
        )

    def create_summary(
        self,
        name: str,
        help: str,
        label_names: Sequence[str] | None = None,
        quantiles: Sequence[tuple[float, float]] | None = None,
    ) -> Summary:
        validate_metric_name(name)
        validate_label_names(label_names)

        full_name = f"{self.full_prefix}{name}"

        return Summary(
            full_name,
            help,
            labelnames=list(label_names) if label_names else [],
            registry=self.registry,
        )

    def get_metrics_as_string(self) -> str:
        from prometheus_client import generate_latest

        return generate_latest(self.registry).decode("utf-8")

    def clear_metrics(self) -> None:
        collectors = list(self.registry._collector_to_names.keys())
        for collector in collectors:
            try:
                self.registry.unregister(collector)
            except Exception:
                pass


def create_metrics_context(config: MetricsConfig) -> MetricsContext:
    return _MetricsContextImpl(config)
