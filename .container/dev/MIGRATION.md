# PM2 to Podman Migration Guide

## Configuration Mapping

### Environment Variables

PM2 configs used `env` blocks. These are now in:
1. `docker-compose.yml` - Service-specific environment variables
2. `env.example` - Template for shared variables
3. `.env` - Local overrides (gitignored)

### Working Directory

- **PM2**: Used `cwd` to set working directory
- **Podman**: Uses `working_dir` in docker-compose.yml

### Scripts/Commands

- **PM2**: Ran pnpm commands via `script: 'pnpm'` and `args`
- **Podman**: Runs same commands in container with `command: sh -c "pnpm install && pnpm --filter ..."`

### Restart Policies

- **PM2**: Auto-restart on failure (default)
- **Podman**: `restart: unless-stopped` in docker-compose.yml

## Storage Volumes

### Before (PM2)
Services accessed storage directly on the host filesystem at `storage/`.

### After (Podman)
Volume mounts map storage directories into containers:
- `storage/perses` → `/data/perses` (perses container)
- `storage/victoria_metrics` → `/data/victoria_metrics` (victoriametrics container)
- `storage/` → `/data/storage` (external-bridge containers)
- Entire monorepo → `/workspace` (all Node.js containers)

## Networking

### Before (PM2)
Services communicated via localhost and process-manager port definitions.

### After (Podman)
- All containers in `dev-network` bridge network
- Inter-service communication via container hostnames
- Port mappings to host for external access
- Same port numbers maintained for compatibility

## Command Comparison

### Start Services

| PM2 | Podman |
|-----|--------|
| `pm2 start process-manager/dev/ecosystem.config.js` | `./scripts/start.sh` or `podman compose up -d` |

### View Logs

| PM2 | Podman |
|-----|--------|
| `pm2 logs coordinator` | `podman compose logs -f coordinator` |
| `pm2 logs` | `podman compose logs -f` |

### Stop Services

| PM2 | Podman |
|-----|--------|
| `pm2 stop all` | `podman compose down` |

### Restart Service

| PM2 | Podman |
|-----|--------|
| `pm2 restart coordinator` | `podman compose restart coordinator` |

### View Status

| PM2 | Podman |
|-----|--------|
| `pm2 status` | `podman compose ps` |

## Migration Steps

### 1. Install Prerequisites

```bash
# Install podman
sudo apt-get install -y podman

# Install podman compose
pip3 install podman compose
```

### 4. Start Podman Services

```bash
cd .container/dev
./scripts/start.sh
```

### 5. Verify Services

```bash
# Check Podman services
podman compose ps

# Check PM2 services
pm2 status

# Test service endpoints
curl http://localhost:3500  # coordinator
curl http://localhost:8080  # perses
curl http://localhost:8428  # victoriametrics
```

## Troubleshooting

### Port Conflicts

If you get port binding errors, ensure PM2 services are stopped:
```bash
pm2 stop all
pm2 delete all
# Then keep only packages-build
pm2 start process-manager/dev/packages/ecosystem.config.js
```

### Storage Access Issues

Ensure storage directories exist:
```bash
mkdir -p storage/perses
mkdir -p storage/victoria_metrics
chmod -R 755 storage
```

### Container Build Failures

Clean and rebuild:
```bash
podman compose down
podman system prune -a
podman compose build --no-cache
```

## Production Deployment

For production VPS deployment:

1. Use the systemd service file: `podman compose-dev.service`
2. Update paths and user/group
3. Install and enable:
   ```bash
   sudo cp podman compose-dev.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now podman compose-dev
   ```

## Rollback to PM2

If needed, rollback to PM2:

```bash
# Stop Podman
cd .container/dev
./scripts/stop.sh

# Start all PM2 services
pm2 start process-manager/dev/ecosystem.config.js
```

## Future Enhancements

- [ ] Add health checks to containers
- [ ] Implement container resource limits (CPU/memory)
- [ ] Add production docker-compose configuration
- [ ] Create CI/CD pipeline for container builds
- [ ] Add container log rotation
- [ ] Implement secrets management
- [ ] Add service dependency ordering


