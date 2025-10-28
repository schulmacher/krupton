# Dashboard-as-Code (CUE)

This directory contains Dashboard-as-Code definitions using CUE language. This is the recommended approach for managing Perses dashboards programmatically.

## Why Dashboard-as-Code with CUE?

- **Type Safety**: CUE provides schema validation at build time
- **Reusability**: Define common patterns and reuse them across dashboards
- **Version Control**: Track dashboard changes in git
- **Automation**: Easy integration with CI/CD pipelines
- **Maintainability**: Code-based dashboards are easier to maintain than JSON/YAML

## Prerequisites

- **CUE**: Install via `brew install cue-lang/tap/cue` (macOS) or see [CUE installation guide](https://cuelang.org/docs/install/)
- **percli**: Already included in `../bin/percli`

## Setup

The CUE module has already been initialized with:

```bash
cue mod init github.com/taltech/loputoo/perses-dac
```

And the Perses SDK has been installed:

```bash
bin/percli dac setup --version v0.52.0
```

## Available Resources

All resources in the `dac/` directory are automatically built and deployed using `percli`'s native directory support:

- **victoriametrics-datasource.cue**: VictoriaMetrics global datasource definition
- **project.cue**: Default project definition
- **nodejs-process.cue**: Node.js process metrics dashboard (prom-client default metrics)

### Adding New Resources

To add a new dashboard or resource, simply:
1. Create your `.cue` file in the `dac/` directory
2. Run `pnpm dac:deploy` - `percli` will automatically discover and build all `.cue` files!

## Workflow

### 1. Develop Dashboards

Edit or create `.cue` files in this directory:

```bash
# Example structure
package mydac

import "github.com/perses/perses/cue/dac-utils/dashboard@v0"

dashboard & {
	#name:    "my-dashboard"
	#project: "default"

	spec: {
		display: {
			name:        "My Dashboard"
			description: "Dashboard description"
		}
		duration: "1h"
		
		panelGroups: [
			{
				#title: "Metrics"
				#cols:  1
				panels: [
					// Panel definitions here
				]
			},
		]
	}
}
```

### 2. Build Resources

Build all resources in the `dac/` directory to generate JSON output:

```bash
# Build all resources (percli automatically discovers all .cue files)
pnpm --filter 'perses' dac:build

# Or manually with percli
cd dac && ../bin/percli dac build -d . -ojson

# Build a single resource (if needed)
cd dac && ../bin/percli dac build -f external-bridge-fetcher.cue -ojson
```

Built resources will be in the `built/` directory.

### 3. Validate Dashboards

You can validate your CUE files before building:

```bash
cue vet external-bridge-fetcher.cue
```

### 4. Deploy Resources

Deploy all built resources to Perses:

```bash
# Build and deploy in one command (recommended)
pnpm --filter 'perses' dac:deploy

# Or deploy only (if already built)
pnpm --filter 'perses' dac:apply

# Or use percli directly
../bin/percli apply -d built  # Applies all files in built/

# Apply a single resource (if needed)
../bin/percli apply -f built/external-bridge-fetcher_output.json
```

**Note**: `percli apply -d` automatically applies all JSON files in the directory.

### 5. Login to Perses (First Time)

If you haven't logged in yet:

```bash
../bin/percli login http://localhost:8080
```

### Referencing the Global Datasource

All panels reference the global `victoriametrics` datasource:

```cue
datasource: name: "victoriametrics"
```

This datasource is configured in `../data/globaldatasources/victoriametrics.yaml`.

## Documentation

- [Perses Dashboard-as-Code Getting Started](https://perses.dev/perses/docs/dac/getting-started/)
- [CUE SDK Documentation](https://perses.dev/perses/docs/dac/cue/)
- [CUE Language Guide](https://cuelang.org/docs/)
- [Panel Groups](https://perses.dev/perses/docs/dac/cue/panelgroups/)

## Troubleshooting

### Build Errors

If you get CUE validation errors:

1. Check your CUE syntax with `cue vet <file>`
2. Ensure all imports are correct
3. Verify field names match the schema

### Deployment Errors

If deployment fails:

1. Ensure Perses is running: `pnpm --filter 'perses' start`
2. Check you're logged in: `../bin/percli config`
3. Verify the project exists in Perses
4. Check the built JSON file is valid

### Checking What Was Deployed

```bash
curl http://localhost:8080/api/v1/projects/default/dashboards/external-bridge-fetcher
```

Or visit: http://localhost:8080/projects/default/dashboards/external-bridge-fetcher
