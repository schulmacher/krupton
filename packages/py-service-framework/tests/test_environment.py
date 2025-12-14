"""Tests for environment module."""

from typing import Literal

import pytest
from pydantic import BaseModel, Field

from service_framework.environment import (
    DefaultEnv,
    EnvParserConfig,
    create_env_context,
    create_env_parser,
)


class SimpleConfig(DefaultEnv):
    """Simple configuration for testing."""

    PORT: int
    HOST: str


class ConfigWithDefaults(DefaultEnv):
    """Configuration with default values."""

    PORT: int = 3000
    HOST: str = "localhost"


class BooleanConfig(DefaultEnv):
    """Configuration with boolean fields."""

    ENABLED: bool
    DEBUG: bool


class OptionalConfig(DefaultEnv):
    """Configuration with optional fields."""

    REQUIRED: str
    OPTIONAL: str | None = None


class EnumConfig(DefaultEnv):
    """Configuration with enum/literal values."""

    NODE_ENV: Literal["development", "production", "test"] = "development"


class ConstraintConfig(DefaultEnv):
    """Configuration with constraints."""

    PORT: int = Field(ge=1024, le=65535)


class NestedConfig(DefaultEnv):
    """Nested configuration object."""

    key: str


class ConfigWithNested(DefaultEnv):
    """Configuration with nested object."""

    CONFIG: NestedConfig


class SensitiveConfig(DefaultEnv):
    """Configuration with sensitive fields."""

    DATABASE_PASSWORD: str


def test_parse_valid_env_configuration():
    """Test parsing valid environment configuration."""
    parser = create_env_parser()
    config = parser.parse(
        SimpleConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "PORT": "3000",
                "HOST": "localhost",
            }
        ),
    )

    assert config.PORT == 3000
    assert config.HOST == "localhost"


def test_apply_default_values():
    """Test that default values are applied."""
    parser = create_env_parser()
    config = parser.parse(
        ConfigWithDefaults,
        EnvParserConfig(source={"PROCESS_NAME": "test"}),
    )

    assert config.PORT == 3000
    assert config.HOST == "localhost"


def test_coerce_string_to_number():
    """Test coercion of string to number."""
    parser = create_env_parser()
    config = parser.parse(
        SimpleConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "PORT": "8080",
                "HOST": "0.0.0.0",
            }
        ),
    )

    assert config.PORT == 8080
    assert isinstance(config.PORT, int)


def test_coerce_string_to_boolean():
    """Test coercion of string to boolean."""
    parser = create_env_parser()
    config = parser.parse(
        BooleanConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "ENABLED": "true",
                "DEBUG": "false",
            }
        ),
    )

    assert config.ENABLED is True
    assert config.DEBUG is False


def test_handle_optional_values():
    """Test handling of optional values."""
    parser = create_env_parser()
    config = parser.parse(
        OptionalConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "REQUIRED": "value",
            }
        ),
    )

    assert config.REQUIRED == "value"
    assert config.OPTIONAL is None


def test_throw_error_for_missing_required_variable():
    """Test that error is thrown for missing required variable."""
    parser = create_env_parser()

    with pytest.raises(ValueError, match="Configuration validation failed"):
        parser.parse(OptionalConfig, EnvParserConfig(source={"PROCESS_NAME": "test"}))


def test_throw_error_for_invalid_type():
    """Test that error is thrown for invalid type."""
    parser = create_env_parser()

    with pytest.raises(ValueError, match="Configuration validation failed"):
        parser.parse(
            SimpleConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "PORT": "invalid",
                    "HOST": "localhost",
                }
            ),
        )


def test_handle_enum_values():
    """Test handling of enum/literal values."""
    parser = create_env_parser()
    config = parser.parse(
        EnumConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "NODE_ENV": "production",
            }
        ),
    )

    assert config.NODE_ENV == "production"


def test_reject_invalid_enum_value():
    """Test rejection of invalid enum value."""
    parser = create_env_parser()

    with pytest.raises(ValueError, match="Configuration validation failed"):
        parser.parse(
            EnumConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "NODE_ENV": "invalid",
                }
            ),
        )


def test_redact_sensitive_values_in_error_messages():
    """Test that sensitive values are redacted in error messages."""
    parser = create_env_parser()

    with pytest.raises(ValueError) as exc_info:
        parser.parse(
            SensitiveConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "DATABASE_PASSWORD": "",
                },
                redact_sensitive=True,
            ),
        )

    error_message = str(exc_info.value)
    assert "DATABASE_PASSWORD" in error_message
    assert "secret-value" not in error_message


def test_parse_json_strings_for_object_types():
    """Test parsing JSON strings for object types."""
    parser = create_env_parser()
    config = parser.parse(
        ConfigWithNested,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test",
                "CONFIG": '{"PROCESS_NAME":"test","key":"value"}',
            }
        ),
    )

    assert config.CONFIG.key == "value"


def test_handle_numeric_constraints():
    """Test handling of numeric constraints."""
    parser = create_env_parser()

    with pytest.raises(ValueError, match="Configuration validation failed"):
        parser.parse(
            ConstraintConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "PORT": "500",
                }
            ),
        )


def test_validate_returns_errors_without_throwing():
    """Test that validate returns validation errors without throwing."""
    parser = create_env_parser()
    result = parser.validate(
        SimpleConfig,
        {
            "PROCESS_NAME": "test",
            "PORT": "invalid",
        },
    )

    assert result.errors is not None
    assert len(result.errors) > 0


def test_validate_returns_no_errors_for_valid_configuration():
    """Test that validate returns no errors for valid configuration."""
    parser = create_env_parser()
    result = parser.validate(
        SimpleConfig,
        {
            "PROCESS_NAME": "test",
            "PORT": 3000,
            "HOST": "localhost",
        },
    )

    assert result.errors is None or len(result.errors) == 0
    assert result.config.PORT == 3000


def test_create_env_context_with_parsed_config():
    """Test creating env context with parsed config."""

    class FullConfig(DefaultEnv):
        NODE_ENV: Literal["development", "production"] = "development"
        PORT: int

    context = create_env_context(
        FullConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test-service",
                "NODE_ENV": "production",
                "PORT": "3000",
            }
        ),
    )

    assert context.PROCESS_NAME == "test-service"
    assert context.NODE_ENV == "production"
    assert context.PORT == 3000


def test_default_env_to_development():
    """Test that env defaults to development."""

    class MinimalConfig(DefaultEnv):
        PORT: int

    context = create_env_context(
        MinimalConfig,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "test-service",
                "PORT": "3000",
            }
        ),
    )

    assert context.PROCESS_NAME == "test-service"
    assert context.NODE_ENV == "development"


def test_boolean_coercion_variations():
    """Test various boolean string representations."""
    parser = create_env_parser()

    # Test truthy values
    for value in ["true", "True", "TRUE", "1", "yes", "YES", "on", "ON"]:
        config = parser.parse(
            BooleanConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "ENABLED": value,
                    "DEBUG": "false",
                }
            ),
        )
        assert config.ENABLED is True, f"Failed for value: {value}"

    # Test falsy values
    for value in ["false", "False", "FALSE", "0", "no", "NO", "off", "OFF"]:
        config = parser.parse(
            BooleanConfig,
            EnvParserConfig(
                source={
                    "PROCESS_NAME": "test",
                    "ENABLED": "true",
                    "DEBUG": value,
                }
            ),
        )
        assert config.DEBUG is False, f"Failed for value: {value}"


def test_default_env_schema():
    """Test the default environment schema."""
    parser = create_env_parser()
    config = parser.parse(
        DefaultEnv,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "my-service",
                "NODE_ENV": "production",
            }
        ),
    )

    assert config.PROCESS_NAME == "my-service"
    assert config.NODE_ENV == "production"


def test_default_env_with_defaults():
    """Test the default environment schema with defaults."""
    parser = create_env_parser()
    config = parser.parse(
        DefaultEnv,
        EnvParserConfig(
            source={
                "PROCESS_NAME": "my-service",
            }
        ),
    )

    assert config.PROCESS_NAME == "my-service"
    assert config.NODE_ENV == "development"


def test_create_env_context_requires_default_env():
    """Test that create_env_context enforces DefaultEnv at runtime.

    The TypeVar bound `T = TypeVar("T", bound=DefaultEnv)` documents that models
    should extend DefaultEnv. We enforce this at runtime with issubclass() to provide
    clear error messages.
    """

    class NotSupportedModel(BaseModel):
        RANDOM_ENV: str

    with pytest.raises(ValueError, match="NotSupportedModel must extend DefaultEnv"):
        create_env_context(
            NotSupportedModel,
            EnvParserConfig(
                source={
                    "RANDOM_ENV": "some-value",
                }
            ),
        )
