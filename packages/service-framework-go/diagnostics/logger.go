package diagnostics

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

type logger struct {
	serviceName      string
	correlationID    string
	minimumSeverity  int
	outputFormat     LogOutputFormat
	outputWriter     io.Writer
	errorWriter      io.Writer
}

// NewLogger creates a new logger instance
func NewLogger(serviceName, correlationID string, cfg *Config) Logger {
	minimumSeverity := severityLevels[SeverityInfo]
	outputFormat := FormatJSON

	if cfg != nil {
		if cfg.MinimumSeverity != "" {
			if level, ok := severityLevels[cfg.MinimumSeverity]; ok {
				minimumSeverity = level
			}
		}
		if cfg.OutputFormat != "" {
			outputFormat = cfg.OutputFormat
		}
	}

	return &logger{
		serviceName:     serviceName,
		correlationID:   correlationID,
		minimumSeverity: minimumSeverity,
		outputFormat:    outputFormat,
		outputWriter:    os.Stdout,
		errorWriter:     os.Stderr,
	}
}

// Debug logs a debug message
func (l *logger) Debug(message string, fields ...map[string]interface{}) {
	l.log(SeverityDebug, message, mergeFields(fields...))
}

// Info logs an info message
func (l *logger) Info(message string, fields ...map[string]interface{}) {
	l.log(SeverityInfo, message, mergeFields(fields...))
}

// Warn logs a warning message
func (l *logger) Warn(message string, fields ...map[string]interface{}) {
	l.log(SeverityWarn, message, mergeFields(fields...))
}

// Error logs an error message
func (l *logger) Error(message string, fields ...map[string]interface{}) {
	l.log(SeverityError, message, mergeFields(fields...))
}

// Fatal logs a fatal message
func (l *logger) Fatal(message string, fields ...map[string]interface{}) {
	l.log(SeverityFatal, message, mergeFields(fields...))
}

// CreateChild creates a child logger with a scoped correlation ID
func (l *logger) CreateChild(scopeID string) Logger {
	childCorrelationID := scopeID
	if l.correlationID != "" {
		childCorrelationID = fmt.Sprintf("%s.%s", l.correlationID, scopeID)
	}

	return &logger{
		serviceName:     l.serviceName,
		correlationID:   childCorrelationID,
		minimumSeverity: l.minimumSeverity,
		outputFormat:    l.outputFormat,
		outputWriter:    l.outputWriter,
		errorWriter:     l.errorWriter,
	}
}

// log performs the actual logging operation
func (l *logger) log(severity LogSeverity, message string, fields map[string]interface{}) {
	severityLevel := severityLevels[severity]
	if severityLevel < l.minimumSeverity {
		return
	}

	entry := LogEntry{
		Timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
		Severity:      severity,
		Message:       message,
		ServiceName:   l.serviceName,
		CorrelationID: l.correlationID,
		Fields:        fields,
	}

	formattedOutput := l.formatLogEntry(entry)

	writer := l.outputWriter
	if severity == SeverityError || severity == SeverityFatal {
		writer = l.errorWriter
	}

	fmt.Fprintln(writer, formattedOutput)
}

// formatLogEntry formats a log entry based on the output format
func (l *logger) formatLogEntry(entry LogEntry) string {
	switch l.outputFormat {
	case FormatJSON:
		return formatAsJSON(entry)
	case FormatHuman:
		return formatAsHumanReadable(entry)
	case FormatStructuredText:
		return formatAsStructuredText(entry)
	default:
		return formatAsJSON(entry)
	}
}

// formatAsJSON formats a log entry as JSON
func formatAsJSON(entry LogEntry) string {
	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Sprintf(`{"error":"failed to marshal log entry: %v"}`, err)
	}
	return string(data)
}

// formatAsHumanReadable formats a log entry for human reading with colors
func formatAsHumanReadable(entry LogEntry) string {
	severityColors := map[LogSeverity]string{
		SeverityDebug: "\x1b[36m", // Cyan
		SeverityInfo:  "\x1b[32m", // Green
		SeverityWarn:  "\x1b[33m", // Yellow
		SeverityError: "\x1b[31m", // Red
		SeverityFatal: "\x1b[35m", // Magenta
	}

	resetColor := "\x1b[0m"
	severityColor := severityColors[entry.Severity]
	severityText := fmt.Sprintf("%-5s", strings.ToUpper(string(entry.Severity)))

	correlationPart := ""
	if entry.CorrelationID != "" {
		correlationPart = fmt.Sprintf(" [%s]", entry.CorrelationID)
	}

	fieldsPart := ""
	if len(entry.Fields) > 0 {
		fieldsJSON, _ := json.Marshal(entry.Fields)
		fieldsPart = fmt.Sprintf(" %s", string(fieldsJSON))
	}

	return fmt.Sprintf("%s %s%s%s [%s]%s %s%s",
		entry.Timestamp,
		severityColor,
		severityText,
		resetColor,
		entry.ServiceName,
		correlationPart,
		entry.Message,
		fieldsPart,
	)
}

// formatAsStructuredText formats a log entry as structured text
func formatAsStructuredText(entry LogEntry) string {
	parts := []string{
		fmt.Sprintf("timestamp=%s", entry.Timestamp),
		fmt.Sprintf("severity=%s", entry.Severity),
		fmt.Sprintf("service_name=%s", entry.ServiceName),
		fmt.Sprintf(`message="%s"`, entry.Message),
	}

	if entry.CorrelationID != "" {
		parts = append(parts, fmt.Sprintf("correlation_id=%s", entry.CorrelationID))
	}

	if len(entry.Fields) > 0 {
		for key, value := range entry.Fields {
			serialized := serializeValue(value)
			parts = append(parts, fmt.Sprintf("%s=%s", key, serialized))
		}
	}

	return strings.Join(parts, " ")
}

// serializeValue serializes a value for structured text format
func serializeValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		return fmt.Sprintf(`"%s"`, v)
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return fmt.Sprintf("%v", v)
	case bool:
		return fmt.Sprintf("%t", v)
	default:
		data, _ := json.Marshal(v)
		return string(data)
	}
}

// mergeFields merges multiple field maps into one
func mergeFields(fieldMaps ...map[string]interface{}) map[string]interface{} {
	if len(fieldMaps) == 0 {
		return nil
	}

	result := make(map[string]interface{})
	for _, fields := range fieldMaps {
		for key, value := range fields {
			result[key] = value
		}
	}

	if len(result) == 0 {
		return nil
	}

	return result
}
