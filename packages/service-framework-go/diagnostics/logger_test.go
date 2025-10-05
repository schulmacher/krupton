package diagnostics

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCorrelationIDGenerator(t *testing.T) {
	t.Run("generates root IDs with req- prefix", func(t *testing.T) {
		generator := NewCorrelationIDGenerator()
		rootID := generator.GenerateRootID()
		assert.True(t, strings.HasPrefix(rootID, "req-"))
		assert.Greater(t, len(rootID), 4)
	})

	t.Run("creates scoped IDs by appending scope to parent", func(t *testing.T) {
		generator := NewCorrelationIDGenerator()
		parentID := "req-abc123"
		scope := "operation"
		scopedID := generator.CreateScopedID(parentID, scope)
		assert.Equal(t, "req-abc123.operation", scopedID)
	})

	t.Run("creates nested scoped IDs", func(t *testing.T) {
		generator := NewCorrelationIDGenerator()
		rootID := generator.GenerateRootID()
		firstScope := generator.CreateScopedID(rootID, "operation")
		secondScope := generator.CreateScopedID(firstScope, "subrequest")
		assert.True(t, strings.HasPrefix(secondScope, "req-"))
		assert.True(t, strings.HasSuffix(secondScope, ".operation.subrequest"))
	})

	t.Run("extracts root ID from scoped ID", func(t *testing.T) {
		generator := NewCorrelationIDGenerator()
		rootID := "req-xyz789"
		scopedID := "req-xyz789.operation.subrequest.cache"
		extracted := generator.ExtractRootID(scopedID)
		assert.Equal(t, rootID, extracted)
	})

	t.Run("returns original ID when no scope delimiter exists", func(t *testing.T) {
		generator := NewCorrelationIDGenerator()
		simpleID := "req-simple"
		extracted := generator.ExtractRootID(simpleID)
		assert.Equal(t, simpleID, extracted)
	})
}

func TestLogger_JSON(t *testing.T) {
	t.Run("logs info messages with JSON format", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatJSON,
		})

		logger.Info("Test message", map[string]interface{}{"key": "value"})

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)

		assert.Equal(t, SeverityInfo, entry.Severity)
		assert.Equal(t, "Test message", entry.Message)
		assert.Equal(t, "test-id", entry.CorrelationID)
		assert.Equal(t, "value", entry.Fields["key"])
	})

	t.Run("logs error messages to stderr", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		logger := createTestLogger(&stdout, &stderr, &Config{
			OutputFormat: FormatJSON,
		})

		logger.Error("Error occurred", map[string]interface{}{"code": float64(500)})

		assert.Empty(t, stdout.String())
		assert.NotEmpty(t, stderr.String())

		var entry LogEntry
		err := json.Unmarshal(stderr.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, SeverityError, entry.Severity)
	})

	t.Run("logs fatal messages to stderr", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		logger := createTestLogger(&stdout, &stderr, &Config{
			OutputFormat: FormatJSON,
		})

		logger.Fatal("Fatal error", map[string]interface{}{"terminating": true})

		assert.Empty(t, stdout.String())
		assert.NotEmpty(t, stderr.String())

		var entry LogEntry
		err := json.Unmarshal(stderr.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, SeverityFatal, entry.Severity)
	})

	t.Run("respects minimum severity level", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			MinimumSeverity: SeverityWarn,
			OutputFormat:    FormatJSON,
		})

		logger.Debug("Debug message")
		logger.Info("Info message")
		logger.Warn("Warning message")

		lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
		assert.Equal(t, 1, len(lines))

		var entry LogEntry
		err := json.Unmarshal([]byte(lines[0]), &entry)
		require.NoError(t, err)
		assert.Equal(t, SeverityWarn, entry.Severity)
	})

	t.Run("creates child logger with scoped correlation ID", func(t *testing.T) {
		var buf bytes.Buffer
		parentLogger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatJSON,
		})

		childLogger := parentLogger.CreateChild("child-scope")
		childLogger.Info("Child message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Equal(t, "test-id.child-scope", entry.CorrelationID)
	})

	t.Run("handles logging without correlation ID", func(t *testing.T) {
		var buf bytes.Buffer
		logger := &logger{
			serviceName:     "test-service",
			correlationID:   "",
			minimumSeverity: severityLevels[SeverityInfo],
			outputFormat:    FormatJSON,
			outputWriter:    &buf,
			errorWriter:     &buf,
		}

		logger.Info("Message without correlation")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Empty(t, entry.CorrelationID)
	})

	t.Run("handles logging without fields", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatJSON,
		})

		logger.Info("Simple message")

		var entry LogEntry
		err := json.Unmarshal(buf.Bytes(), &entry)
		require.NoError(t, err)
		assert.Nil(t, entry.Fields)
	})
}

func TestLogger_HumanReadable(t *testing.T) {
	t.Run("formats logs as human readable text", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatHuman,
		})

		logger.Info("Human readable message", map[string]interface{}{"key": "value"})

		output := buf.String()
		assert.Contains(t, output, "INFO")
		assert.Contains(t, output, "[test-id]")
		assert.Contains(t, output, "Human readable message")
		assert.Contains(t, output, `"key":"value"`)
	})

	t.Run("includes service name", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatHuman,
		})

		logger.Info("Test message")

		output := buf.String()
		assert.Contains(t, output, "[test-service]")
	})

	t.Run("shows different colors for different severities", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			MinimumSeverity: SeverityDebug,
			OutputFormat:    FormatHuman,
		})

		logger.Debug("Debug message")
		logger.Info("Info message")
		logger.Warn("Warn message")

		output := buf.String()
		assert.Contains(t, output, "DEBUG")
		assert.Contains(t, output, "INFO")
		assert.Contains(t, output, "WARN")
	})
}

func TestLogger_StructuredText(t *testing.T) {
	t.Run("formats logs as structured text", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatStructuredText,
		})

		logger.Info("Structured message", map[string]interface{}{
			"key":   "value",
			"count": 42,
		})

		output := buf.String()
		assert.Contains(t, output, "severity=info")
		assert.Contains(t, output, `message="Structured message"`)
		assert.Contains(t, output, "correlation_id=test-id")
		assert.Contains(t, output, `key="value"`)
		assert.Contains(t, output, "count=42")
	})

	t.Run("handles different field types", func(t *testing.T) {
		var buf bytes.Buffer
		logger := createTestLogger(&buf, &buf, &Config{
			OutputFormat: FormatStructuredText,
		})

		logger.Info("Test", map[string]interface{}{
			"string":  "text",
			"number":  123,
			"float":   45.67,
			"boolean": true,
		})

		output := buf.String()
		assert.Contains(t, output, `string="text"`)
		assert.Contains(t, output, "number=123")
		assert.Contains(t, output, "float=45.67")
		assert.Contains(t, output, "boolean=true")
	})

	t.Run("omits correlation_id when empty", func(t *testing.T) {
		var buf bytes.Buffer
		logger := &logger{
			serviceName:     "test-service",
			correlationID:   "",
			minimumSeverity: severityLevels[SeverityInfo],
			outputFormat:    FormatStructuredText,
			outputWriter:    &buf,
			errorWriter:     &buf,
		}

		logger.Info("Test message")

		output := buf.String()
		assert.NotContains(t, output, "correlation_id=")
	})
}

func TestLogger_AllSeverities(t *testing.T) {
	severities := []struct {
		name     string
		logFunc  func(Logger, string)
		severity LogSeverity
	}{
		{"debug", func(l Logger, msg string) { l.Debug(msg) }, SeverityDebug},
		{"info", func(l Logger, msg string) { l.Info(msg) }, SeverityInfo},
		{"warn", func(l Logger, msg string) { l.Warn(msg) }, SeverityWarn},
		{"error", func(l Logger, msg string) { l.Error(msg) }, SeverityError},
		{"fatal", func(l Logger, msg string) { l.Fatal(msg) }, SeverityFatal},
	}

	for _, tc := range severities {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := createTestLogger(&buf, &buf, &Config{
				MinimumSeverity: SeverityDebug,
				OutputFormat:    FormatJSON,
			})

			tc.logFunc(logger, "Test message")

			var entry LogEntry
			err := json.Unmarshal(buf.Bytes(), &entry)
			require.NoError(t, err)
			assert.Equal(t, tc.severity, entry.Severity)
		})
	}
}

// createTestLogger creates a logger with custom output writers for testing
func createTestLogger(stdout, stderr *bytes.Buffer, cfg *Config) Logger {
	l := NewLogger("test-service", "test-id", cfg).(*logger)
	l.outputWriter = stdout
	l.errorWriter = stderr
	return l
}
