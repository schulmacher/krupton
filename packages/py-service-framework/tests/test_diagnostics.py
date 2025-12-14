"""Tests for diagnostics module."""

import json
import re

import pytest

from service_framework import (
    DefaultEnv,
    create_correlation_id_generator,
    create_diagnostic_context,
    create_logger,
)
from service_framework.diagnostics import DiagnosticConfig


def create_test_env_context() -> DefaultEnv:
    """Create a test environment context."""
    return DefaultEnv(PROCESS_NAME="test-service", NODE_ENV="test")


class TestCorrelationIdGenerator:
    """Tests for correlation ID generator."""

    def test_generates_root_ids_with_req_prefix(self):
        """Test that root IDs are generated with req- prefix."""
        generator = create_correlation_id_generator()
        root_id = generator.generate_root_id()
        assert re.match(r"^req-[0-9a-f-]+$", root_id)

    def test_creates_scoped_ids_by_appending_scope_to_parent(self):
        """Test scoped ID creation."""
        generator = create_correlation_id_generator()
        parent_id = "req-abc123"
        scope = "operation"
        scoped_id = generator.create_scoped_id(parent_id, scope)
        assert scoped_id == "req-abc123.operation"

    def test_creates_nested_scoped_ids(self):
        """Test nested scoped ID creation."""
        generator = create_correlation_id_generator()
        root_id = generator.generate_root_id()
        first_scope = generator.create_scoped_id(root_id, "operation")
        second_scope = generator.create_scoped_id(first_scope, "subrequest")
        assert re.match(r"^req-.+\.operation\.subrequest$", second_scope)

    def test_extracts_root_id_from_scoped_id(self):
        """Test root ID extraction from scoped ID."""
        generator = create_correlation_id_generator()
        root_id = "req-xyz789"
        scoped_id = "req-xyz789.operation.subrequest.cache"
        extracted = generator.extract_root_id(scoped_id)
        assert extracted == root_id

    def test_returns_original_id_when_no_scope_delimiter_exists(self):
        """Test extraction when no delimiter exists."""
        generator = create_correlation_id_generator()
        simple_id = "req-simple"
        extracted = generator.extract_root_id(simple_id)
        assert extracted == simple_id


class TestLogger:
    """Tests for logger."""

    def test_logs_info_messages_with_json_format(self, capsys):
        """Test logging info messages in JSON format."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="json"),
        )
        logger.info("Test message", {"key": "value"})

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())

        assert parsed["severity"] == "info"
        assert parsed["message"] == "Test message"
        assert parsed["correlationId"] == "test-id"
        assert parsed["fields"]["key"] == "value"

    def test_logs_error_messages_to_stderr(self, capsys):
        """Test that error messages go to stderr."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="json"),
        )
        logger.error(Exception("Test error"), "Error occurred", {"code": 500})

        captured = capsys.readouterr()
        parsed = json.loads(captured.err.strip())

        assert parsed["severity"] == "error"
        assert parsed["message"] == "Test error"
        assert parsed["fields"]["additional_message"] == "Error occurred"

    def test_logs_fatal_messages_to_stderr(self, capsys):
        """Test that fatal messages go to stderr."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="json"),
        )
        logger.fatal(Exception("Test error"), "Fatal error", {"terminating": True})

        captured = capsys.readouterr()
        parsed = json.loads(captured.err.strip())

        assert parsed["severity"] == "fatal"

    def test_respects_minimum_severity_level(self, capsys):
        """Test severity level filtering."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(minimum_severity="warn", output_format="json"),
        )

        logger.debug("Debug message")
        logger.info("Info message")
        logger.warn("Warning message")

        captured = capsys.readouterr()
        lines = [line for line in captured.out.strip().split("\n") if line]

        assert len(lines) == 1
        parsed = json.loads(lines[0])
        assert parsed["severity"] == "warn"

    def test_creates_child_logger_with_scoped_correlation_id(self, capsys):
        """Test child logger creation with scoped correlation ID."""
        parent_logger = create_logger(
            "test-service",
            "parent-id",
            DiagnosticConfig(output_format="json"),
        )
        child_logger = parent_logger.create_child("child-scope")

        child_logger.info("Child message")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["correlationId"] == "parent-id.child-scope"

    def test_formats_logs_as_human_readable_text(self, capsys):
        """Test human-readable format."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="human"),
        )
        logger.info("Human readable message", {"key": "value"})

        captured = capsys.readouterr()
        output = captured.out

        assert "info" in output
        assert "process=" in output
        assert "test-service" in output
        assert "Human readable message" in output
        assert "key=" in output
        assert "value" in output

    def test_formats_logs_as_structured_text(self, capsys):
        """Test structured text format."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="structured-text"),
        )
        logger.info("Structured message", {"key": "value", "count": 42})

        captured = capsys.readouterr()
        output = captured.out

        assert "severity=info" in output
        assert 'message="Structured message"' in output
        assert "correlation_id=test-id" in output
        assert 'key="value"' in output
        assert "count=42" in output

    def test_handles_logging_without_correlation_id(self, capsys):
        """Test logging without correlation ID."""
        logger = create_logger(
            "test-service",
            None,
            DiagnosticConfig(output_format="json"),
        )
        logger.info("Message without correlation")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert "correlationId" not in parsed

    def test_handles_logging_without_fields(self, capsys):
        """Test logging without extra fields."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="json"),
        )
        logger.info("Simple message")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["fields"] == {}

    def test_error_with_dict_message(self, capsys):
        """Test error logging with dict as message."""
        logger = create_logger(
            "test-service",
            "test-id",
            DiagnosticConfig(output_format="json"),
        )
        logger.error(Exception("Test error"), {"code": 500, "retry": True})

        captured = capsys.readouterr()
        parsed = json.loads(captured.err.strip())

        assert parsed["severity"] == "error"
        assert parsed["fields"]["code"] == 500
        assert parsed["fields"]["retry"] is True


class TestDiagnosticContext:
    """Tests for diagnostic context."""

    def test_creates_diagnostic_context_with_correlation_id_generator(self):
        """Test diagnostic context creation."""
        context = create_diagnostic_context(create_test_env_context())
        assert context.correlation_id_generator is not None
        assert context.logger is not None
        assert context.create_child_logger is not None

    def test_creates_root_logger_with_generated_correlation_id(self, capsys):
        """Test root logger with auto-generated correlation ID."""
        context = create_diagnostic_context(
            create_test_env_context(),
            DiagnosticConfig(output_format="json"),
        )

        context.logger.info("Test message")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert re.match(r"^req-[0-9a-f-]+$", parsed["correlationId"])

    def test_creates_logger_with_specific_correlation_id(self, capsys):
        """Test logger creation with specific correlation ID."""
        context = create_diagnostic_context(
            create_test_env_context(),
            DiagnosticConfig(output_format="json"),
        )
        logger = context.create_child_logger("custom-id")

        logger.info("Test message")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["correlationId"] == "custom-id"

    def test_creates_child_diagnostic_context(self, capsys):
        """Test child diagnostic context creation."""
        parent_context = create_diagnostic_context(
            create_test_env_context(),
            DiagnosticConfig(output_format="json", correlation_id="parent-id"),
        )

        child_context = parent_context.get_child_diagnostic_context(
            {"environment": "test"},
            "scope",
        )

        child_context.logger.info("Child context message")

        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["correlationId"] == "scope::parent-id"
        assert parsed["fields"]["environment"] == "test"
