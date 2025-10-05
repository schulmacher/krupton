package environment

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
)

type envParser struct {
	validate *validator.Validate
}

// NewParser creates a new environment parser with validation
func NewParser() Parser {
	return &envParser{
		validate: validator.New(),
	}
}

// Parse parses environment variables into the provided config struct
func (p *envParser) Parse(config interface{}, opts ...ParserConfig) error {
	cfg := p.getConfig(opts)

	source := cfg.Source
	if source == nil {
		source = envToMap()
	}

	if err := p.parseStruct(config, source); err != nil {
		return fmt.Errorf("failed to parse environment: %w", err)
	}

	// Apply defaults
	p.applyDefaults(config)

	// Validate
	result := p.Validate(config, opts...)
	if len(result.Errors) > 0 {
		errMsg := FormatErrors(result.Errors, cfg.RedactSensitive)
		return fmt.Errorf("%s", errMsg)
	}

	return nil
}

// Validate validates the configuration without panicking
func (p *envParser) Validate(config interface{}, opts ...ParserConfig) ParsedEnv[interface{}] {
	cfg := p.getConfig(opts)

	err := p.validate.Struct(config)
	if err == nil {
		return ParsedEnv[interface{}]{
			Config: config,
			Errors: nil,
		}
	}

	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok {
		return ParsedEnv[interface{}]{
			Config: config,
			Errors: []ValidationError{
				{Path: "root", Message: err.Error()},
			},
		}
	}

	errors := make([]ValidationError, 0, len(validationErrors))
	for _, fieldErr := range validationErrors {
		path := p.fieldNameToEnvName(fieldErr.Field())
		value := fieldErr.Value()

		if cfg.RedactSensitive && isSensitiveField(path) {
			value = "[REDACTED]"
		}

		errors = append(errors, ValidationError{
			Path:    path,
			Message: p.formatValidationMessage(fieldErr),
			Value:   value,
		})
	}

	return ParsedEnv[interface{}]{
		Config: config,
		Errors: errors,
	}
}

// parseStruct parses environment variables into struct fields
func (p *envParser) parseStruct(config interface{}, source map[string]string) error {
	v := reflect.ValueOf(config)
	if v.Kind() != reflect.Ptr {
		return fmt.Errorf("config must be a pointer to struct")
	}

	v = v.Elem()
	if v.Kind() != reflect.Struct {
		return fmt.Errorf("config must be a pointer to struct")
	}

	t := v.Type()
	for i := 0; i < v.NumField(); i++ {
		field := v.Field(i)
		fieldType := t.Field(i)

		// Skip unexported fields
		if !field.CanSet() {
			continue
		}

		envName := fieldType.Tag.Get("env")
		if envName == "" {
			envName = fieldType.Name
		}

		envValue, exists := source[envName]
		if !exists || envValue == "" {
			continue
		}

		if err := p.setField(field, envValue, fieldType); err != nil {
			return fmt.Errorf("failed to set field %s: %w", envName, err)
		}
	}

	return nil
}

// setField sets a struct field value from a string
func (p *envParser) setField(field reflect.Value, value string, fieldType reflect.StructField) error {
	switch field.Kind() {
	case reflect.String:
		field.SetString(value)

	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		intVal, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return fmt.Errorf("cannot convert %q to int: %w", value, err)
		}
		field.SetInt(intVal)

	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		uintVal, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return fmt.Errorf("cannot convert %q to uint: %w", value, err)
		}
		field.SetUint(uintVal)

	case reflect.Float32, reflect.Float64:
		floatVal, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("cannot convert %q to float: %w", value, err)
		}
		field.SetFloat(floatVal)

	case reflect.Bool:
		boolVal, err := p.parseBool(value)
		if err != nil {
			return fmt.Errorf("cannot convert %q to bool: %w", value, err)
		}
		field.SetBool(boolVal)

	case reflect.Slice, reflect.Map, reflect.Struct:
		// Try to parse as JSON
		ptr := reflect.New(field.Type())
		if err := json.Unmarshal([]byte(value), ptr.Interface()); err != nil {
			return fmt.Errorf("cannot parse %q as JSON: %w", value, err)
		}
		field.Set(ptr.Elem())

	default:
		return fmt.Errorf("unsupported field type: %s", field.Kind())
	}

	return nil
}

// parseBool parses boolean values from strings with common variations
func (p *envParser) parseBool(value string) (bool, error) {
	lower := strings.ToLower(value)
	switch lower {
	case "true", "1", "yes", "on", "t", "y":
		return true, nil
	case "false", "0", "no", "off", "f", "n":
		return false, nil
	default:
		return false, fmt.Errorf("invalid boolean value: %s", value)
	}
}

// applyDefaults applies default values from struct tags
func (p *envParser) applyDefaults(config interface{}) {
	v := reflect.ValueOf(config).Elem()
	t := v.Type()

	for i := 0; i < v.NumField(); i++ {
		field := v.Field(i)
		fieldType := t.Field(i)

		if !field.CanSet() {
			continue
		}

		defaultValue := fieldType.Tag.Get("default")
		if defaultValue == "" {
			continue
		}

		// Only apply default if field is zero value
		if !field.IsZero() {
			continue
		}

		_ = p.setField(field, defaultValue, fieldType)
	}
}

// fieldNameToEnvName converts a struct field name to environment variable name
func (p *envParser) fieldNameToEnvName(fieldName string) string {
	// Try to find the actual env tag if possible
	// For now, just return the field name as-is
	return fieldName
}

// formatValidationMessage formats a validator error into a readable message
func (p *envParser) formatValidationMessage(err validator.FieldError) string {
	switch err.Tag() {
	case "required":
		return "field is required"
	case "min":
		return fmt.Sprintf("minimum value is %s", err.Param())
	case "max":
		return fmt.Sprintf("maximum value is %s", err.Param())
	case "oneof":
		return fmt.Sprintf("must be one of: %s", err.Param())
	case "email":
		return "must be a valid email"
	case "url":
		return "must be a valid URL"
	default:
		return fmt.Sprintf("validation failed: %s", err.Tag())
	}
}

// getConfig extracts parser config with defaults
func (p *envParser) getConfig(opts []ParserConfig) ParserConfig {
	if len(opts) == 0 {
		return ParserConfig{
			RedactSensitive: true,
			AllowUnknown:    false,
			Source:          nil,
		}
	}
	cfg := opts[0]
	// Apply default for RedactSensitive if not explicitly set
	if !cfg.RedactSensitive {
		cfg.RedactSensitive = true
	}
	return cfg
}

// envToMap converts os.Environ() to a map
func envToMap() map[string]string {
	env := make(map[string]string)
	for _, e := range os.Environ() {
		pair := strings.SplitN(e, "=", 2)
		if len(pair) == 2 {
			env[pair[0]] = pair[1]
		}
	}
	return env
}

// NewContext creates a new environment context with the given config
func NewContext[T any](config T) Context[T] {
	// Try to extract NodeEnv from the config if it has that field
	nodeEnv := "development"

	v := reflect.ValueOf(config)
	if v.Kind() == reflect.Struct {
		nodeEnvField := v.FieldByName("NodeEnv")
		if nodeEnvField.IsValid() && nodeEnvField.Kind() == reflect.String {
			if val := nodeEnvField.String(); val != "" {
				nodeEnv = val
			}
		}
	}

	return Context[T]{
		Config:  config,
		NodeEnv: nodeEnv,
	}
}

// ParseAndCreateContext is a convenience function that parses environment
// variables and creates a context in one call
func ParseAndCreateContext[T any](config *T, opts ...ParserConfig) (Context[T], error) {
	parser := NewParser()
	if err := parser.Parse(config, opts...); err != nil {
		return Context[T]{}, err
	}
	return NewContext(*config), nil
}
