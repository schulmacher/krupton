# Repository Architecture

## Overview

This project implements a TypeScript-based monorepo architecture managed with pnpm workspaces, providing a scalable foundation for building multiple applications that share common libraries and interfaces. The architecture leverages modern tooling to enable instant hot-reload during development with shared dependencies across all workspace packages.

## Package Manager: pnpm

The project uses pnpm version 9.12.2 as its package manager, explicitly specified in the package manager field of the root configuration. pnpm was selected for several key advantages over traditional package managers:

- **Efficient disk space usage** through content-addressable storage, where packages are stored once globally and linked via hard links
- **Fast installations** with parallel dependency resolution and intelligent caching
- **Strict dependency management** that prevents phantom dependencies (dependencies accessible but not declared)
- **Native workspace support** specifically designed for monorepo management without additional tooling

## Workspace Structure

The monorepo is organized into two main categories as defined in the pnpm workspace configuration file:

<pre>
├── apps/ # Application packages
│ ├── public-api/
│ └── public-api-mock-client/
└── packages/ # Shared libraries
├── config/
├── interface/
└── utils/
</pre>

### Applications Layer

The applications layer contains two executable packages:

**public-api** (`@krupton/public-api`)
- Main API server implementation built with Fastify framework and WebSocket support
- Consumes shared interfaces and configuration packages
- Executes on Node.js runtime with tsx for TypeScript execution

**public-api-mock-client** (`@krupton/public-api-mock-client`)
- Mock WebSocket client implementation for API testing and validation
- Depends on shared interface, utility, and configuration packages
- Provides development and testing capabilities for the main API

### Shared Packages Layer

The shared packages layer provides reusable code and configuration:

**config** (`@krupton/config`)
- Centralized configuration package serving as a single source of truth
- Exports standardized configurations for ESLint, Prettier, TypeScript, tsup bundler, and Vitest testing framework
- Ensures consistency across all workspace packages

**interface** (`@krupton/interface`)
- Shared TypeScript interfaces, types, and schemas
- Integrates Zod library for runtime type validation
- Built with tsup bundler and TypeScript compiler to generate declaration maps
- Provides both source files and compiled outputs for flexible consumption

**utils** (`@krupton/utils`)
- Shared utility functions and helper modules
- Includes Zod-based validation utilities
- Compiled with tsup and TypeScript for optimized distribution

## Workspace Dependencies

All internal packages utilize the pnpm workspace protocol (denoted as `workspace:*`), which provides several benefits:

- Automatic linking to local workspace packages without manual intervention
- Eliminates need for external linking tools or manual symlink management
- Maintains version flexibility during active development
- Ensures type definitions remain synchronized across dependent packages

This protocol establishes a dependency graph where applications depend on shared packages, and changes to shared packages immediately propagate to consuming applications during development.

## TypeScript Configuration

The project implements a centralized TypeScript configuration strategy:

- Base configuration resides in the config package
- Individual packages extend the base configuration with package-specific overrides
- All packages are configured as ECMAScript modules (ESM)
- Compilation target is Node.js version 18 or higher
- Declaration files include source maps for enhanced IDE navigation

This approach ensures type-checking consistency while allowing flexibility for package-specific requirements.

## Development Workflow: Instant Hot-Reload

The repository architecture is optimized for rapid development feedback cycles through watch mode compilation and automatic restart mechanisms.

### Shared Library Development Mode

Shared packages in the packages directory employ tsup in watch mode for real-time compilation. The development script executes two concurrent processes:

1. **tsup watch mode** monitors source files and triggers incremental rebuilds using esbuild, typically completing in 50-100 milliseconds
2. **TypeScript compiler** regenerates declaration files (.d.ts) to maintain type information

This dual-process approach ensures both runtime code and type definitions remain synchronized during active development.

### Application Development Mode

Application packages utilize tsx watch mode combined with concurrent type-checking. The development configuration runs two parallel processes:

1. **tsx watch** executes the application with automatic restart on file changes, detecting both local changes and updates to linked workspace dependencies
2. **tsc watch** provides continuous type-checking without code emission, offering immediate feedback on type errors

Both processes run concurrently with distinguished console output to separate runtime logs from type-checking results.

### Complete Development Stack

For comprehensive hot-reload functionality across the entire monorepo, two separate processes must be active:

- **Library watch process**: Monitors and rebuilds all shared packages in the packages directory
- **Application watch process**: Runs all applications with hot-reload enabled, monitoring both local changes and library updates

**Hot-reload propagation workflow:**
1. Developer modifies a source file in a shared package
2. tsup detects the change and rebuilds compiled output (approximately 50-100ms)
3. tsx in dependent applications detects the distribution file change
4. Applications automatically restart with updated code (approximately 100-200ms)
5. Total feedback cycle time: approximately 150-300ms

This architecture enables near-instantaneous feedback when developing shared libraries, eliminating traditional monorepo development friction.

## Build Configuration

### Shared Library Build Process

Shared libraries employ tsup, an esbuild-based bundler, for JavaScript compilation. The base configuration specifies:

- Clean build directory before compilation
- Declaration file generation enabled
- Source map generation for debugging support
- Node.js 18 compilation target
- ESM output format exclusively
- Code splitting disabled for simpler output
- Minification disabled for readable output

Following JavaScript compilation, the TypeScript compiler runs in declaration-only mode to generate type definition files with declaration maps. This two-stage process separates runtime code generation from type information generation.

**Build output structure:**
- Compiled JavaScript in ECMAScript module format
- JavaScript source maps for runtime debugging
- TypeScript declaration files for type information
- Declaration maps enabling Go-to-Definition navigation to source files

### Application Build Process

Application packages use the TypeScript compiler directly for compilation rather than bundling. Since applications serve as final execution targets rather than distributable libraries, full bundling is unnecessary. The compiler simply transforms TypeScript source to JavaScript while performing type-checking.

## Package Export Configuration

Shared libraries define explicit export configurations to support both TypeScript and JavaScript consumers:

- **types field**: Points to TypeScript declaration files for type information
- **source field**: References original source files for tools supporting direct TypeScript consumption
- **default field**: References compiled JavaScript for runtime execution

This export configuration ensures compatibility with various module resolution strategies and build tools while maintaining optimal development experience.

## Command Structure

### Root-Level Commands

The root package defines commands that operate across the entire workspace:

- **build**: Compiles all packages in topological dependency order
- **dev**: Executes all applications in parallel development mode
- **dev:deps**: Watches and rebuilds all shared libraries continuously
- **lint**: Performs ESLint validation across all packages
- **format**: Applies Prettier formatting to all source files
- **test**: Executes test suites in all packages
- **typecheck**: Validates TypeScript types without emitting compiled output

The recursive flag enables commands to propagate through all workspace packages in dependency order. The parallel flag allows simultaneous execution for independent operations. The filter flag enables targeting specific workspace patterns.

### Package-Level Commands

Each individual package implements a consistent command interface:

- **build**: Compiles source for production deployment
- **dev**: Activates development mode with hot-reload capability
- **lint**: Executes ESLint code quality checks
- **format**: Applies Prettier code formatting
- **test**: Runs Vitest test suites
- **typecheck**: Validates TypeScript types without compilation

This consistency simplifies operation across the monorepo and reduces cognitive overhead when switching between packages.

## Technology Stack

The architecture integrates several modern development tools:

- **pnpm**: Fast, disk-efficient package manager with native workspace support
- **TypeScript 5.9+**: Statically-typed JavaScript superset with advanced type system features
- **tsup**: High-performance bundler leveraging esbuild for library compilation
- **tsx**: TypeScript execution engine for Node.js runtime without pre-compilation
- **concurrently**: Process manager for running multiple commands in parallel
- **ESLint**: Extensible code linting with TypeScript integration
- **Prettier**: Opinionated code formatter ensuring consistent style
- **Vitest**: Fast unit testing framework with native ESM support
- **Zod**: Runtime validation library with TypeScript type inference

## Architectural Benefits

This monorepo architecture provides several key advantages:

1. **Rapid Feedback Cycles**: Changes to shared libraries propagate to consuming applications within milliseconds, eliminating traditional build delays

2. **Type Safety**: Full TypeScript support with declaration maps enables accurate Go-to-Definition navigation and refactoring across package boundaries

3. **Code Reusability**: Common interfaces, utilities, and configurations are shared across applications, reducing duplication and maintaining consistency

4. **Tooling Consistency**: Centralized configuration ensures all packages utilize identical ESLint rules, Prettier settings, and TypeScript configurations

5. **Dependency Efficiency**: pnpm's architecture prevents duplicate dependencies across the workspace, reducing disk usage and installation time

6. **Parallel Development**: Multiple applications can execute simultaneously while sharing actively-developed libraries

7. **Environment Separation**: Distinct development and production build configurations optimize for their respective use cases

## Development Best Practices

The architecture establishes several development practices for optimal workflow:

1. **Active library development** requires running the dependency watch process to ensure continuous compilation

2. **Workspace protocol usage** for all internal dependencies maintains proper linking during development and installation

3. **Configuration inheritance** from the central config package ensures consistency without duplication

4. **Index file exports** from package entry points provide clean import paths for consuming code

5. **Declaration map generation** enables IDE features like Go-to-Definition to navigate to source files rather than compiled declarations

6. **ECMAScript module usage** throughout the codebase aligns with modern JavaScript standards and Node.js best practices