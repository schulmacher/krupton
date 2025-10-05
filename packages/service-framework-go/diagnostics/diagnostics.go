package diagnostics

import (
	"github.com/krupton/service-framework-go/environment"
)

// NewContext creates a new diagnostic context with a root logger
func NewContext(envCtx environment.Context[environment.DefaultConfig], cfg *Config) Context {
	correlationIDGenerator := NewCorrelationIDGenerator()
	serviceName := envCtx.Config.ProcessName
	rootID := correlationIDGenerator.GenerateRootID()
	rootLogger := NewLogger(serviceName, rootID, cfg)

	return Context{
		CorrelationIDGenerator: correlationIDGenerator,
		Logger:                 rootLogger,
		CreateChildLogger: func(correlationID string) Logger {
			return NewLogger(serviceName, correlationID, cfg)
		},
	}
}

// NewContextWithServiceName creates a diagnostic context with a custom service name
func NewContextWithServiceName(serviceName string, cfg *Config) Context {
	correlationIDGenerator := NewCorrelationIDGenerator()
	rootID := correlationIDGenerator.GenerateRootID()
	rootLogger := NewLogger(serviceName, rootID, cfg)

	return Context{
		CorrelationIDGenerator: correlationIDGenerator,
		Logger:                 rootLogger,
		CreateChildLogger: func(correlationID string) Logger {
			return NewLogger(serviceName, correlationID, cfg)
		},
	}
}
