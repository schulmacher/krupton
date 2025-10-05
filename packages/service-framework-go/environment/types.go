package environment

import (
	"fmt"
	"strings"
)

// ValidationError represents a single validation error for an environment variable
type ValidationError struct {
	Path    string
	Message string
	Value   interface{}
}

// ParsedEnv represents the result of parsing environment variables
type ParsedEnv[T any] struct {
	Config T
	Errors []ValidationError
}

// ParserConfig configures how environment variables are parsed
type ParserConfig struct {
	// RedactSensitive determines if sensitive values should be redacted in errors
	RedactSensitive bool
	// AllowUnknown determines if unknown environment variables are allowed
	AllowUnknown bool
	// Source provides custom environment variables (defaults to os.Environ())
	Source map[string]string
}

// Parser handles parsing and validation of environment variables
type Parser interface {
	// Parse parses environment variables into the config struct and panics on error
	Parse(config interface{}, opts ...ParserConfig) error
	// Validate validates environment variables without panicking
	Validate(config interface{}, opts ...ParserConfig) ParsedEnv[interface{}]
}

// Context wraps the parsed configuration with additional metadata
type Context[T any] struct {
	Config  T
	NodeEnv string
}

// DefaultConfig represents the minimal required environment configuration
type DefaultConfig struct {
	ProcessName string `env:"PROCESS_NAME" validate:"required,min=1"`
	NodeEnv     string `env:"NODE_ENV" validate:"omitempty,oneof=development production test"`
}

// Error implements the error interface for validation errors
func (e ValidationError) Error() string {
	if e.Value != nil {
		return fmt.Sprintf("%s: %s (value: %v)", e.Path, e.Message, e.Value)
	}
	return fmt.Sprintf("%s: %s", e.Path, e.Message)
}

// FormatErrors formats multiple validation errors into a readable string
func FormatErrors(errors []ValidationError, redactSensitive bool) string {
	if len(errors) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("Configuration validation failed:\n")

	for _, err := range errors {
		value := err.Value
		if redactSensitive && isSensitiveField(err.Path) {
			value = "[REDACTED]"
		}

		if value != nil {
			sb.WriteString(fmt.Sprintf("  - %s: %s (received: %v)\n", err.Path, err.Message, value))
		} else {
			sb.WriteString(fmt.Sprintf("  - %s: %s\n", err.Path, err.Message))
		}
	}

	return strings.TrimSuffix(sb.String(), "\n")
}

// isSensitiveField checks if a field name suggests it contains sensitive data
func isSensitiveField(fieldName string) bool {
	lower := strings.ToLower(fieldName)
	sensitivePatterns := []string{
		"password", "secret", "key", "token",
		"credential", "auth", "api_key", "apikey",
	}

	for _, pattern := range sensitivePatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}
