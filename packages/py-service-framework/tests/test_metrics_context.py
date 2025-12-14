"""Tests for metrics context module."""

from pydantic import Field

from service_framework import DefaultEnv, create_env_context
from service_framework.metrics_context import (
    MetricsConfig,
    create_metrics_context,
    normalize_service_name,
    validate_label_names,
    validate_metric_name,
)


class MetricsTestEnv(DefaultEnv):
    PROCESS_NAME: str = Field(default="test-metrics-service")


class TestNormalizeServiceName:
    def test_converts_to_lowercase(self):
        assert normalize_service_name("TestService") == "test_service"

    def test_replaces_special_chars_with_underscores(self):
        assert normalize_service_name("test-service") == "test_service"
        assert normalize_service_name("test.service") == "test_service"
        assert normalize_service_name("test service") == "test_service"

    def test_removes_leading_and_trailing_underscores(self):
        assert normalize_service_name("_test_service_") == "test_service"

    def test_collapses_multiple_underscores(self):
        assert normalize_service_name("test__service") == "test_service"
        assert normalize_service_name("test___service") == "test_service"


class TestValidateMetricName:
    def test_accepts_valid_metric_names(self):
        validate_metric_name("valid_metric")
        validate_metric_name("ValidMetric")
        validate_metric_name("metric123")
        validate_metric_name("_metric")
        validate_metric_name("metric:subsystem:name")

    def test_rejects_empty_metric_name(self):
        try:
            validate_metric_name("")
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "cannot be empty" in str(e)

    def test_rejects_metric_name_starting_with_number(self):
        try:
            validate_metric_name("123metric")
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Invalid metric name" in str(e)

    def test_rejects_metric_name_with_invalid_chars(self):
        try:
            validate_metric_name("metric-name")
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Invalid metric name" in str(e)


class TestValidateLabelNames:
    def test_accepts_valid_label_names(self):
        validate_label_names(["label1", "label_2", "Label3"])

    def test_accepts_none_or_empty_list(self):
        validate_label_names(None)
        validate_label_names([])

    def test_rejects_label_starting_with_number(self):
        try:
            validate_label_names(["1label"])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Invalid label name" in str(e)

    def test_rejects_label_with_invalid_chars(self):
        try:
            validate_label_names(["label-name"])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Invalid label name" in str(e)

    def test_rejects_reserved_label_names(self):
        try:
            validate_label_names(["__reserved"])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "is reserved" in str(e)


class TestMetricsContext:
    def test_creates_metrics_context_with_service_name_prefix(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        counter = metrics_context.create_counter(name="requests", help="Total number of requests")

        assert counter._name == "test_metrics_service_requests"

    def test_creates_metrics_context_with_custom_prefix(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env, prefix="custom")
        metrics_context = create_metrics_context(config)

        counter = metrics_context.create_counter(name="requests", help="Total number of requests")

        assert counter._name == "custom_requests"

    def test_creates_counter_with_labels(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        counter = metrics_context.create_counter(
            name="requests_total",
            help="Total number of requests",
            label_names=["method", "status"],
        )

        counter.labels(method="GET", status="200").inc()
        counter.labels(method="POST", status="201").inc(2)

        assert counter.labels(method="GET", status="200")._value.get() == 1
        assert counter.labels(method="POST", status="201")._value.get() == 2

    def test_creates_gauge(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        gauge = metrics_context.create_gauge(
            name="active_connections", help="Number of active connections"
        )

        gauge.set(10)
        assert gauge._value.get() == 10

        gauge.inc()
        assert gauge._value.get() == 11

        gauge.dec(2)
        assert gauge._value.get() == 9

    def test_creates_histogram_with_default_buckets(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        histogram = metrics_context.create_histogram(
            name="request_duration_seconds", help="Request duration in seconds"
        )

        histogram.observe(0.5)
        histogram.observe(1.5)

        assert histogram._sum.get() == 2.0

    def test_creates_histogram_with_custom_buckets(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        histogram = metrics_context.create_histogram(
            name="request_duration_seconds",
            help="Request duration in seconds",
            buckets=[0.1, 0.5, 1.0, 5.0],
        )

        histogram.observe(0.3)

        assert histogram._sum.get() == 0.3

    def test_creates_summary(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        summary = metrics_context.create_summary(
            name="response_size_bytes", help="Response size in bytes"
        )

        summary.observe(100)
        summary.observe(200)
        summary.observe(300)

        assert summary._sum.get() == 600
        assert summary._count.get() == 3

    def test_gets_metrics_as_string(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        counter = metrics_context.create_counter(name="test_counter", help="Test counter")
        counter.inc(5)

        metrics_output = metrics_context.get_metrics_as_string()

        assert "test_metrics_service_test_counter" in metrics_output
        assert "Test counter" in metrics_output
        assert "5.0" in metrics_output

    def test_clears_metrics(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        metrics_context.create_counter(name="test_counter", help="Test counter")

        metrics_before = metrics_context.get_metrics_as_string()
        assert "test_counter" in metrics_before

        metrics_context.clear_metrics()

        metrics_after = metrics_context.get_metrics_as_string()
        assert metrics_after == ""

    def test_collects_default_metrics_by_default(self):
        import sys

        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env)
        metrics_context = create_metrics_context(config)

        metrics_output = metrics_context.get_metrics_as_string()

        assert "python_info" in metrics_output
        assert "python_gc_objects_collected_total" in metrics_output

        if sys.platform == "linux":
            assert "process_cpu_seconds_total" in metrics_output
            assert "process_virtual_memory_bytes" in metrics_output

    def test_can_disable_default_metrics(self):
        env = create_env_context(MetricsTestEnv)
        config = MetricsConfig(env_context=env, enable_default_metrics=False)
        metrics_context = create_metrics_context(config)

        metrics_output = metrics_context.get_metrics_as_string()

        assert "python_info" not in metrics_output
        assert "python_gc_objects_collected_total" not in metrics_output
        assert metrics_output == ""
