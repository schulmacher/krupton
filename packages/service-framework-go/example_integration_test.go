package serviceframework_test

import (
	"fmt"

	"github.com/krupton/service-framework-go/diagnostics"
	"github.com/krupton/service-framework-go/environment"
)

// Example_fullIntegration demonstrates using environment and diagnostics together
func Example_fullIntegration() {
	// Define service configuration
	type ServiceConfig struct {
		ProcessName string `env:"PROCESS_NAME" validate:"required,min=1"`
		NodeEnv     string `env:"NODE_ENV" validate:"omitempty,oneof=development production test"`
		Port        int    `env:"PORT" validate:"required,min=1024,max=65535"`
		Host        string `env:"HOST" default:"0.0.0.0"`
		EnableDebug bool   `env:"ENABLE_DEBUG"`
	}

	// Parse environment configuration
	config := &ServiceConfig{}
	envCtx, err := environment.ParseAndCreateContext(config, environment.ParserConfig{
		Source: map[string]string{
			"PROCESS_NAME": "example-service",
			"NODE_ENV":     "production",
			"PORT":         "8080",
			"HOST":         "0.0.0.0",
			"ENABLE_DEBUG": "false",
		},
	})
	if err != nil {
		panic(err)
	}

	// Create diagnostic context with structured logging
	diagCfg := &diagnostics.Config{
		MinimumSeverity: diagnostics.SeverityInfo,
		OutputFormat:    diagnostics.FormatJSON,
	}
	diagCtx := diagnostics.NewContextWithServiceName(config.ProcessName, diagCfg)

	// Log service startup
	diagCtx.Logger.Info("Service starting", map[string]interface{}{
		"port":    config.Port,
		"host":    config.Host,
		"nodeEnv": envCtx.NodeEnv,
	})

	// Create child logger for a specific operation
	requestLogger := diagCtx.Logger.CreateChild("http-request-abc123")
	requestLogger.Info("Handling request", map[string]interface{}{
		"method": "GET",
		"path":   "/api/users",
	})

	// Log success
	requestLogger.Info("Request completed", map[string]interface{}{
		"statusCode": 200,
		"duration":   "45ms",
	})

	fmt.Println("Service configured and logging operational")
}

// Note: This example demonstrates the integration of environment parsing
// and diagnostic logging. In production, logs would be captured by your
// logging infrastructure rather than printed to stdout.
