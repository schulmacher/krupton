package environment_test

import (
	"fmt"
	"log"

	"github.com/krupton/service-framework-go/environment"
)

// Example demonstrates basic usage of the environment parser
func Example() {
	type Config struct {
		Port int    `env:"PORT" validate:"required,min=1024,max=65535"`
		Host string `env:"HOST" validate:"required" default:"localhost"`
	}

	var config Config
	parser := environment.NewParser()

	err := parser.Parse(&config, environment.ParserConfig{
		Source: map[string]string{
			"PORT": "3000",
			"HOST": "0.0.0.0",
		},
	})

	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Server: %s:%d\n", config.Host, config.Port)
	// Output: Server: 0.0.0.0:3000
}

// ExampleNewContext demonstrates creating an environment context
func ExampleNewContext() {
	type AppConfig struct {
		ProcessName string `env:"PROCESS_NAME"`
		NodeEnv     string `env:"NODE_ENV"`
		Port        int    `env:"PORT"`
	}

	config := AppConfig{
		ProcessName: "my-service",
		NodeEnv:     "production",
		Port:        8080,
	}

	ctx := environment.NewContext(config)

	fmt.Printf("%s running in %s\n", ctx.Config.ProcessName, ctx.NodeEnv)
	// Output: my-service running in production
}

// ExampleParseAndCreateContext demonstrates parsing and creating context in one call
func ExampleParseAndCreateContext() {
	type ServiceConfig struct {
		ProcessName string `env:"PROCESS_NAME" validate:"required"`
		NodeEnv     string `env:"NODE_ENV" validate:"oneof=development production test" default:"development"`
		Port        int    `env:"PORT" validate:"required"`
	}

	config := &ServiceConfig{}

	ctx, err := environment.ParseAndCreateContext(config, environment.ParserConfig{
		Source: map[string]string{
			"PROCESS_NAME": "api-service",
			"NODE_ENV":     "production",
			"PORT":         "8080",
		},
	})

	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("%s [%s] on port %d\n",
		ctx.Config.ProcessName,
		ctx.NodeEnv,
		ctx.Config.Port)
	// Output: api-service [production] on port 8080
}

// ExampleParser_Validate demonstrates validation without throwing errors
func ExampleParser_Validate() {
	type Config struct {
		Port int    `env:"PORT" validate:"required,min=1024"`
		Host string `env:"HOST" validate:"required"`
	}

	parser := environment.NewParser()
	config := &Config{
		Port: 500, // Invalid: below minimum
	}

	result := parser.Validate(config)

	if len(result.Errors) > 0 {
		fmt.Println("Validation errors found:")
		for _, err := range result.Errors {
			fmt.Printf("  - %s: %s\n", err.Path, err.Message)
		}
	}
	// Output:
	// Validation errors found:
	//   - Port: minimum value is 1024
	//   - Host: field is required
}
