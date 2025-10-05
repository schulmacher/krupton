package environment

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type TestConfig struct {
	Port            int    `env:"PORT" validate:"required,min=1024,max=65535"`
	Host            string `env:"HOST" validate:"required"`
	MaxConnections  int    `env:"MAX_CONNECTIONS" default:"100"`
	EnableDebug     bool   `env:"ENABLE_DEBUG"`
	OptionalSetting string `env:"OPTIONAL_SETTING"`
}

type EnvConfig struct {
	NodeEnv     string `env:"NODE_ENV" validate:"omitempty,oneof=development production test"`
	ProcessName string `env:"PROCESS_NAME" validate:"required,min=1"`
	Port        int    `env:"PORT" validate:"required"`
}

func TestParser_Parse(t *testing.T) {
	t.Run("parses valid configuration", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "3000",
				"HOST": "localhost",
			},
		})

		require.NoError(t, err)
		assert.Equal(t, 3000, config.Port)
		assert.Equal(t, "localhost", config.Host)
	})

	t.Run("applies default values", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "8080",
				"HOST": "0.0.0.0",
			},
		})

		require.NoError(t, err)
		assert.Equal(t, 100, config.MaxConnections) // default value
	})

	t.Run("coerces string to int", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT":            "8080",
				"HOST":            "localhost",
				"MAX_CONNECTIONS": "200",
			},
		})

		require.NoError(t, err)
		assert.Equal(t, 8080, config.Port)
		assert.Equal(t, 200, config.MaxConnections)
	})

	t.Run("coerces string to bool", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT":         "3000",
				"HOST":         "localhost",
				"ENABLE_DEBUG": "true",
			},
		})

		require.NoError(t, err)
		assert.True(t, config.EnableDebug)
	})

	t.Run("handles various boolean representations", func(t *testing.T) {
		testCases := []struct {
			value    string
			expected bool
		}{
			{"true", true},
			{"TRUE", true},
			{"1", true},
			{"yes", true},
			{"on", true},
			{"false", false},
			{"FALSE", false},
			{"0", false},
			{"no", false},
			{"off", false},
		}

		for _, tc := range testCases {
			t.Run(tc.value, func(t *testing.T) {
				parser := NewParser()
				config := &TestConfig{}

				err := parser.Parse(config, ParserConfig{
					Source: map[string]string{
						"PORT":         "3000",
						"HOST":         "localhost",
						"ENABLE_DEBUG": tc.value,
					},
				})

				require.NoError(t, err)
				assert.Equal(t, tc.expected, config.EnableDebug)
			})
		}
	})

	t.Run("handles optional values", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "3000",
				"HOST": "localhost",
			},
		})

		require.NoError(t, err)
		assert.Empty(t, config.OptionalSetting)
	})

	t.Run("returns error for missing required variable", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "3000",
				// HOST is missing
			},
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "Configuration validation failed")
	})

	t.Run("returns error for invalid type", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "invalid",
				"HOST": "localhost",
			},
		})

		require.Error(t, err)
	})

	t.Run("validates numeric constraints", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"PORT": "500", // below minimum
				"HOST": "localhost",
			},
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "Configuration validation failed")
	})

	t.Run("handles enum values", func(t *testing.T) {
		parser := NewParser()
		config := &EnvConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"NODE_ENV":     "production",
				"PROCESS_NAME": "test-service",
				"PORT":         "3000",
			},
		})

		require.NoError(t, err)
		assert.Equal(t, "production", config.NodeEnv)
	})

	t.Run("rejects invalid enum value", func(t *testing.T) {
		parser := NewParser()
		config := &EnvConfig{}

		err := parser.Parse(config, ParserConfig{
			Source: map[string]string{
				"NODE_ENV":     "invalid",
				"PROCESS_NAME": "test-service",
				"PORT":         "3000",
			},
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "Configuration validation failed")
	})
}

func TestParser_Validate(t *testing.T) {
	t.Run("returns validation errors without panicking", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{
			Port: 500, // Invalid: below minimum
		}

		result := parser.Validate(config)

		assert.NotNil(t, result.Errors)
		assert.Greater(t, len(result.Errors), 0)
	})

	t.Run("returns no errors for valid configuration", func(t *testing.T) {
		parser := NewParser()
		config := &TestConfig{
			Port: 3000,
			Host: "localhost",
		}

		result := parser.Validate(config)

		assert.Nil(t, result.Errors)
		assert.NotNil(t, result.Config)
	})

	t.Run("redacts sensitive values", func(t *testing.T) {
		type SensitiveConfig struct {
			DatabasePassword string `env:"DATABASE_PASSWORD" validate:"required"`
			APIKey           string `env:"API_KEY" validate:"required"`
		}

		parser := NewParser()
		config := &SensitiveConfig{}

		result := parser.Validate(config, ParserConfig{
			RedactSensitive: true,
		})

		assert.NotNil(t, result.Errors)
		for _, err := range result.Errors {
			if isSensitiveField(err.Path) {
				assert.NotContains(t, err.Value, "secret")
			}
		}
	})
}

func TestNewContext(t *testing.T) {
	t.Run("creates context with parsed config", func(t *testing.T) {
		config := EnvConfig{
			NodeEnv:     "production",
			ProcessName: "test-service",
			Port:        3000,
		}

		ctx := NewContext(config)

		assert.Equal(t, "production", ctx.NodeEnv)
		assert.Equal(t, config, ctx.Config)
	})

	t.Run("defaults to development environment", func(t *testing.T) {
		type SimpleConfig struct {
			Port int `env:"PORT"`
		}

		config := SimpleConfig{Port: 3000}
		ctx := NewContext(config)

		assert.Equal(t, "development", ctx.NodeEnv)
	})
}

func TestParseAndCreateContext(t *testing.T) {
	t.Run("parses and creates context in one call", func(t *testing.T) {
		config := &EnvConfig{}

		ctx, err := ParseAndCreateContext(config, ParserConfig{
			Source: map[string]string{
				"NODE_ENV":     "production",
				"PROCESS_NAME": "test-service",
				"PORT":         "3000",
			},
		})

		require.NoError(t, err)
		assert.Equal(t, "production", ctx.NodeEnv)
		assert.Equal(t, "test-service", ctx.Config.ProcessName)
		assert.Equal(t, 3000, ctx.Config.Port)
	})

	t.Run("returns error on validation failure", func(t *testing.T) {
		config := &EnvConfig{}

		_, err := ParseAndCreateContext(config, ParserConfig{
			Source: map[string]string{
				"NODE_ENV": "invalid",
				"PORT":     "3000",
			},
		})

		require.Error(t, err)
	})
}

func TestFormatErrors(t *testing.T) {
	t.Run("formats multiple errors", func(t *testing.T) {
		errors := []ValidationError{
			{Path: "PORT", Message: "field is required", Value: nil},
			{Path: "HOST", Message: "field is required", Value: ""},
		}

		formatted := FormatErrors(errors, false)

		assert.Contains(t, formatted, "Configuration validation failed")
		assert.Contains(t, formatted, "PORT")
		assert.Contains(t, formatted, "HOST")
	})

	t.Run("redacts sensitive values", func(t *testing.T) {
		errors := []ValidationError{
			{Path: "DATABASE_PASSWORD", Message: "field is required", Value: "secret123"},
		}

		formatted := FormatErrors(errors, true)

		assert.Contains(t, formatted, "[REDACTED]")
		assert.NotContains(t, formatted, "secret123")
	})

	t.Run("returns empty string for no errors", func(t *testing.T) {
		formatted := FormatErrors([]ValidationError{}, false)
		assert.Empty(t, formatted)
	})
}

func TestIsSensitiveField(t *testing.T) {
	testCases := []struct {
		field    string
		expected bool
	}{
		{"PASSWORD", true},
		{"DATABASE_PASSWORD", true},
		{"API_KEY", true},
		{"SECRET_TOKEN", true},
		{"AUTH_CREDENTIAL", true},
		{"PORT", false},
		{"HOST", false},
		{"TIMEOUT", false},
	}

	for _, tc := range testCases {
		t.Run(tc.field, func(t *testing.T) {
			result := isSensitiveField(tc.field)
			assert.Equal(t, tc.expected, result)
		})
	}
}
