package diagnostics_test

import (
	"fmt"

	"github.com/krupton/service-framework-go/diagnostics"
	"github.com/krupton/service-framework-go/environment"
)

// Example demonstrates basic usage of the diagnostics package
func Example() {
	// Create environment context
	config := environment.DefaultConfig{
		ProcessName: "my-service",
		NodeEnv:     "production",
	}
	envCtx := environment.NewContext(config)

	// Create diagnostic context
	cfg := &diagnostics.Config{
		MinimumSeverity: diagnostics.SeverityInfo,
		OutputFormat:    diagnostics.FormatJSON,
	}
	diagCtx := diagnostics.NewContext(envCtx, cfg)

	// Use the logger
	diagCtx.Logger.Info("Service started", map[string]interface{}{
		"port": 8080,
		"env":  "production",
	})

	// Create child logger for a specific operation
	childLogger := diagCtx.Logger.CreateChild("database-query")
	childLogger.Debug("Executing query", map[string]interface{}{
		"table": "users",
		"limit": 100,
	})
}

// ExampleLogger_severityLevels demonstrates different log severity levels
func ExampleLogger_severityLevels() {
	cfg := &diagnostics.Config{
		MinimumSeverity: diagnostics.SeverityDebug,
		OutputFormat:    diagnostics.FormatHuman,
	}
	diagCtx := diagnostics.NewContextWithServiceName("example-service", cfg)

	logger := diagCtx.Logger

	logger.Debug("Detailed debug information")
	logger.Info("General information")
	logger.Warn("Warning: something might be wrong")
	logger.Error("Error occurred", map[string]interface{}{
		"error": "connection timeout",
		"code":  500,
	})
}

// ExampleLogger_CreateChild demonstrates hierarchical logging with correlation IDs
func ExampleLogger_CreateChild() {
	cfg := &diagnostics.Config{
		OutputFormat: diagnostics.FormatJSON,
	}
	diagCtx := diagnostics.NewContextWithServiceName("api-service", cfg)

	// Parent operation
	diagCtx.Logger.Info("Handling API request")

	// Child operation 1
	dbLogger := diagCtx.Logger.CreateChild("database")
	dbLogger.Info("Querying database")

	// Child operation 2
	cacheLogger := diagCtx.Logger.CreateChild("cache")
	cacheLogger.Info("Checking cache")

	// Nested child
	cacheReadLogger := cacheLogger.CreateChild("read")
	cacheReadLogger.Debug("Cache read operation")
}

// Example_correlationIDGenerator demonstrates correlation ID management
func Example_correlationIDGenerator() {
	generator := diagnostics.NewCorrelationIDGenerator()

	// Use a fixed ID for demonstration purposes
	rootID := "req-abc123"

	// Create scoped IDs for operations
	dbOpID := generator.CreateScopedID(rootID, "database")
	fmt.Printf("Database operation ID: %s\n", dbOpID)

	// Create nested scope
	queryID := generator.CreateScopedID(dbOpID, "query")
	fmt.Printf("Query ID: %s\n", queryID)

	// Extract root ID from scoped ID
	extracted := generator.ExtractRootID(queryID)
	fmt.Printf("Extracted root ID: %s\n", extracted)
	fmt.Printf("Matches original: %v\n", extracted == rootID)

	// Output:
	// Database operation ID: req-abc123.database
	// Query ID: req-abc123.database.query
	// Extracted root ID: req-abc123
	// Matches original: true
}

// ExampleConfig demonstrates different output formats
func ExampleConfig() {
	config := environment.DefaultConfig{
		ProcessName: "format-demo",
	}
	envCtx := environment.NewContext(config)

	// JSON format (default)
	jsonCfg := &diagnostics.Config{
		OutputFormat: diagnostics.FormatJSON,
	}
	jsonCtx := diagnostics.NewContext(envCtx, jsonCfg)
	jsonCtx.Logger.Info("JSON formatted log")

	// Human-readable format with colors
	humanCfg := &diagnostics.Config{
		OutputFormat: diagnostics.FormatHuman,
	}
	humanCtx := diagnostics.NewContext(envCtx, humanCfg)
	humanCtx.Logger.Info("Human readable log")

	// Structured text format
	structuredCfg := &diagnostics.Config{
		OutputFormat: diagnostics.FormatStructuredText,
	}
	structuredCtx := diagnostics.NewContext(envCtx, structuredCfg)
	structuredCtx.Logger.Info("Structured text log")
}

// ExampleConfig_minimumSeverity demonstrates severity filtering
func ExampleConfig_minimumSeverity() {
	// Only log warnings and above
	cfg := &diagnostics.Config{
		MinimumSeverity: diagnostics.SeverityWarn,
		OutputFormat:    diagnostics.FormatJSON,
	}
	diagCtx := diagnostics.NewContextWithServiceName("filtered-service", cfg)

	logger := diagCtx.Logger

	// These will be filtered out
	logger.Debug("This won't appear")
	logger.Info("This won't appear either")

	// These will be logged
	logger.Warn("This will appear")
	logger.Error("This will also appear")
}
