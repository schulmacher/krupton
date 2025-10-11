#!/bin/bash

# Change to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$COMPOSE_DIR"

# Function to get all service names from docker-compose.yml
get_services() {
  podman compose config --services 2>/dev/null
}

# If no argument provided, show logs for all services
if [ -z "$1" ]; then
  echo "Following logs for all services (Ctrl+C to exit)"
  podman compose logs -f
  exit 0
fi

# Check if pattern contains wildcard
if [[ "$1" == *"*"* ]]; then
  # Get all services and filter by pattern
  PATTERN="$1"
  MATCHING_SERVICES=()
  
  while IFS= read -r service; do
    # Convert pattern to regex (replace * with .*)
    REGEX_PATTERN="${PATTERN//\*/.*}"
    if [[ "$service" =~ ^${REGEX_PATTERN}$ ]]; then
      MATCHING_SERVICES+=("$service")
    fi
  done < <(get_services)
  
  # Check if any services matched
  if [ ${#MATCHING_SERVICES[@]} -eq 0 ]; then
    echo "Error: No services match pattern '$PATTERN'"
    echo ""
    echo "Available services:"
    get_services
    exit 1
  fi
  
  echo "Following logs for ${#MATCHING_SERVICES[@]} service(s) matching '$PATTERN':"
  printf '  - %s\n' "${MATCHING_SERVICES[@]}"
  echo ""
  
  # Follow logs for all matching services
  podman compose logs -f "${MATCHING_SERVICES[@]}"
else
  # No wildcard, treat as exact service name
  echo "Following logs for service: $1"
  podman compose logs -f "$1"
fi

