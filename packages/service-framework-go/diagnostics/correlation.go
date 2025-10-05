package diagnostics

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

const scopeDelimiter = "."

type correlationIDGenerator struct{}

// NewCorrelationIDGenerator creates a new correlation ID generator
func NewCorrelationIDGenerator() CorrelationIDGenerator {
	return &correlationIDGenerator{}
}

// GenerateRootID generates a new root correlation ID with req- prefix
func (g *correlationIDGenerator) GenerateRootID() string {
	return fmt.Sprintf("req-%s", uuid.New().String())
}

// CreateScopedID creates a scoped ID by appending scope to parent ID
func (g *correlationIDGenerator) CreateScopedID(parentID, scope string) string {
	return fmt.Sprintf("%s%s%s", parentID, scopeDelimiter, scope)
}

// ExtractRootID extracts the root ID from a scoped ID
func (g *correlationIDGenerator) ExtractRootID(scopedID string) string {
	firstDelimiterIndex := strings.Index(scopedID, scopeDelimiter)
	if firstDelimiterIndex == -1 {
		return scopedID
	}
	return scopedID[:firstDelimiterIndex]
}
