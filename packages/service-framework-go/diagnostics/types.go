package diagnostics

// LogSeverity represents log severity levels
type LogSeverity string

const (
	SeverityDebug LogSeverity = "debug"
	SeverityInfo  LogSeverity = "info"
	SeverityWarn  LogSeverity = "warn"
	SeverityError LogSeverity = "error"
	SeverityFatal LogSeverity = "fatal"
)

// LogOutputFormat represents the output format for log entries
type LogOutputFormat string

const (
	FormatJSON           LogOutputFormat = "json"
	FormatHuman          LogOutputFormat = "human"
	FormatStructuredText LogOutputFormat = "structured-text"
)

// Logger provides structured logging with correlation IDs
type Logger interface {
	Debug(message string, fields ...map[string]interface{})
	Info(message string, fields ...map[string]interface{})
	Warn(message string, fields ...map[string]interface{})
	Error(message string, fields ...map[string]interface{})
	Fatal(message string, fields ...map[string]interface{})
	CreateChild(correlationID string) Logger
}

// CorrelationIDGenerator generates and manages correlation IDs
type CorrelationIDGenerator interface {
	GenerateRootID() string
	CreateScopedID(parentID, scope string) string
	ExtractRootID(scopedID string) string
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp     string                 `json:"timestamp"`
	Severity      LogSeverity            `json:"severity"`
	Message       string                 `json:"message"`
	ServiceName   string                 `json:"serviceName"`
	CorrelationID string                 `json:"correlationId,omitempty"`
	Fields        map[string]interface{} `json:"fields,omitempty"`
}

// Config configures the diagnostic system
type Config struct {
	MinimumSeverity LogSeverity
	OutputFormat    LogOutputFormat
}

// Context provides diagnostic facilities for a service
type Context struct {
	CorrelationIDGenerator CorrelationIDGenerator
	Logger                 Logger
	CreateChildLogger      func(correlationID string) Logger
}

// severityLevels maps severity names to numeric levels
var severityLevels = map[LogSeverity]int{
	SeverityDebug: 0,
	SeverityInfo:  1,
	SeverityWarn:  2,
	SeverityError: 3,
	SeverityFatal: 4,
}
