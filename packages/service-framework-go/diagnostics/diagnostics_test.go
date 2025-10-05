package diagnostics

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/krupton/service-framework-go/environment"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createTestEnvContext() environment.Context[environment.DefaultConfig] {
	config := environment.DefaultConfig{
		ProcessName: "test-service",
		NodeEnv:     "test",
	}
	return environment.NewContext(config)
}

func TestNewContext(t *testing.T) {
	t.Run("creates diagnostic context with correlation ID generator", func(t *testing.T) {
		ctx := NewContext(createTestEnvContext(), nil)

		assert.NotNil(t, ctx.CorrelationIDGenerator)
		assert.NotNil(t, ctx.Logger)
		assert.NotNil(t, ctx.CreateChildLogger)
	})

	t.Run("creates root logger with generated correlation ID", func(t *testing.T) {
		cfg := &Config{OutputFormat: FormatJSON}
		ctx := NewContext(createTestEnvContext(), cfg)

		// Capture output
		var buf bytes.Buffer
		logger := ctx.Logger.(*logger)
		logger.outputWriter = &buf

		logger.Info("Test message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.True(t, strings.HasPrefix(entry.CorrelationID, "req-"))
	})

	t.Run("creates logger with specific correlation ID", func(t *testing.T) {
		cfg := &Config{OutputFormat: FormatJSON}
		ctx := NewContext(createTestEnvContext(), cfg)

		customLogger := ctx.CreateChildLogger("custom-id")

		// Capture output
		var buf bytes.Buffer
		logger := customLogger.(*logger)
		logger.outputWriter = &buf

		logger.Info("Test message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, "custom-id", entry.CorrelationID)
	})

	t.Run("respects minimum severity config", func(t *testing.T) {
		cfg := &Config{
			MinimumSeverity: SeverityWarn,
			OutputFormat:    FormatJSON,
		}
		ctx := NewContext(createTestEnvContext(), cfg)

		var buf bytes.Buffer
		logger := ctx.Logger.(*logger)
		logger.outputWriter = &buf

		logger.Debug("Debug message")
		logger.Info("Info message")
		logger.Warn("Warn message")

		lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
		assert.Equal(t, 1, len(lines))
	})

	t.Run("uses service name from environment context", func(t *testing.T) {
		cfg := &Config{OutputFormat: FormatJSON}
		ctx := NewContext(createTestEnvContext(), cfg)

		var buf bytes.Buffer
		logger := ctx.Logger.(*logger)
		logger.outputWriter = &buf

		logger.Info("Test message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, "test-service", entry.ServiceName)
	})
}

func TestNewContextWithServiceName(t *testing.T) {
	t.Run("creates context with custom service name", func(t *testing.T) {
		cfg := &Config{OutputFormat: FormatJSON}
		ctx := NewContextWithServiceName("custom-service", cfg)

		var buf bytes.Buffer
		logger := ctx.Logger.(*logger)
		logger.outputWriter = &buf

		logger.Info("Test message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, "custom-service", entry.ServiceName)
	})
}

func TestContext_Integration(t *testing.T) {
	t.Run("full workflow with parent and child loggers", func(t *testing.T) {
		cfg := &Config{
			MinimumSeverity: SeverityDebug,
			OutputFormat:    FormatJSON,
		}
		ctx := NewContext(createTestEnvContext(), cfg)

		// Parent logger
		var parentBuf bytes.Buffer
		parentLogger := ctx.Logger.(*logger)
		parentLogger.outputWriter = &parentBuf

		parentLogger.Info("Parent log", map[string]interface{}{"parent": true})

		// Child logger
		childLogger := ctx.Logger.CreateChild("child-operation")
		var childBuf bytes.Buffer
		childLoggerImpl := childLogger.(*logger)
		childLoggerImpl.outputWriter = &childBuf

		childLogger.Info("Child log", map[string]interface{}{"child": true})

		// Verify parent log
		var parentEntry LogEntry
		err := json.Unmarshal(parentBuf.Bytes(), &parentEntry)
		require.NoError(t, err)
		assert.True(t, parentEntry.Fields["parent"].(bool))
		assert.True(t, strings.HasPrefix(parentEntry.CorrelationID, "req-"))

		// Verify child log
		var childEntry LogEntry
		err = json.Unmarshal(childBuf.Bytes(), &childEntry)
		require.NoError(t, err)
		assert.True(t, childEntry.Fields["child"].(bool))
		assert.True(t, strings.HasSuffix(childEntry.CorrelationID, ".child-operation"))
	})

	t.Run("custom logger from CreateChildLogger", func(t *testing.T) {
		cfg := &Config{OutputFormat: FormatJSON}
		ctx := NewContext(createTestEnvContext(), cfg)

		customLogger := ctx.CreateChildLogger("request-abc123")
		var buf bytes.Buffer
		loggerImpl := customLogger.(*logger)
		loggerImpl.outputWriter = &buf

		customLogger.Info("Custom logger message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, "request-abc123", entry.CorrelationID)
	})
}
