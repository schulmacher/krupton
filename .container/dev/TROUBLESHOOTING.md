# Troubleshooting Guide

## Build Issues

### "No space left on device" Error

**Problem:**
```
Error response from daemon: context directory may be too large
Error: write /var/tmp/libpod_builder.../storage/...: no space left on device
```

**Solution:**
Ensure the `.dockerignore` file exists at the monorepo root (`/Users/e/taltech/loputoo/start/.dockerignore`) and excludes the `storage/` directory:

```
# .dockerignore
storage/
node_modules/
dist/
```

The storage directory should never be included in the Docker build context. It's mounted as a volume at runtime instead.

**Verify:**
```bash
# Check if .dockerignore exists
ls -la ../../.dockerignore

# Clean up and rebuild
podman system prune -f
podman compose build --no-cache
```

### Build Context Too Large

**Problem:**
Build takes a very long time or times out.

**Solution:**
The `.dockerignore` file should exclude large directories:
- `storage/` (data files)
- `node_modules/` (dependencies)
- `dist/` (build outputs)
- `.git/` (git history)

### Permission Denied on Volume Mounts

**Problem:**
```
Error: permission denied
```

**Solution:**
Ensure storage directories exist and have correct permissions:

```bash
cd ../..
mkdir -p storage/perses storage/victoria_metrics
chmod -R 755 storage/
```

## Runtime Issues

### Container Won't Start

**Check logs:**
```bash
podman compose logs [service-name]
```

**Common issues:**
1. Port already in use - Check `.env` file for port conflicts
2. Missing dependencies - Containers run `pnpm install` on startup
3. Volume mount issues - Ensure paths exist

### Port Conflicts

**Problem:**
```
Error: address already in use
```

**Solution:**
1. Check what's using the port:
   ```bash
   lsof -i :3500  # Replace with your port
   ```

2. Change port in `.env`:
   ```bash
   COORDINATOR_PORT=4500
   ```

3. Restart services:
   ```bash
   podman compose down
   podman compose up -d
   ```

### Can't Connect to Service

**Problem:**
Service is running but not accessible.

**Solution:**
1. Check service status:
   ```bash
   podman compose ps
   ```

2. Check if port is mapped:
   ```bash
   podman port dev-coordinator
   ```

3. Verify network:
   ```bash
   podman network inspect dev_dev-network
   ```

### Inter-Service Communication Fails

**Problem:**
Services can't communicate with each other.

**Solution:**
Use container hostnames, not localhost:
- ✅ `http://coordinator:3500`
- ❌ `http://localhost:3500`

All services are on the `dev-network` bridge network and can communicate using their hostnames:
- `coordinator`
- `fetcher-binance`
- `fetcher-kraken`
- `websocket-binance`
- `websocket-kraken`
- `storage`
- `perses`
- `victoriametrics`

## Performance Issues

### Slow pnpm install on Startup

**Problem:**
Node.js services take a long time to start.

**Solution:**
The first start will be slow as pnpm installs dependencies. Subsequent starts are faster due to volume mounts preserving node_modules.

To speed up:
```bash
# Pre-install dependencies on host
pnpm install

# Then start containers (will skip install)
podman compose up -d
```

### High Memory Usage

**Problem:**
Containers using too much memory.

**Solution:**
Add memory limits to `docker-compose.yml`:

```yaml
services:
  coordinator:
    # ... other config
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

## Data Issues

### Storage Data Not Persisting

**Problem:**
Data is lost after container restart.

**Solution:**
Ensure volume mounts are correct in `docker-compose.yml`:

```yaml
volumes:
  - ../../storage:/data/storage
  - ../../storage/perses:/data/perses
  - ../../storage/victoria_metrics:/data/victoria_metrics
```

Data should persist on the host machine in the `storage/` directory.

### Wrong Storage Path Inside Container

**Problem:**
Services can't find storage directory.

**Solution:**
Check `STORAGE_BASE_DIR` environment variable:

```bash
# In .env
STORAGE_BASE_DIR=/data/storage

# Verify inside container
podman compose exec coordinator env | grep STORAGE
```

## Network Issues

### DNS Resolution Fails

**Problem:**
Can't resolve container hostnames.

**Solution:**
All services must be on the same network:

```bash
# Check networks
podman network ls

# Inspect network
podman network inspect dev_dev-network
```

### External Access Not Working

**Problem:**
Can't access services from host machine.

**Solution:**
Ensure ports are mapped to host in `docker-compose.yml`:

```yaml
ports:
  - "3500:3500"  # host:container
```

Access from host: `http://localhost:3500`

## Debugging Tips

### Enter Running Container

```bash
# For Node.js services (has shell)
podman compose exec coordinator sh

# Check environment
podman compose exec coordinator env

# Check running processes
podman compose exec coordinator ps aux
```

### View Real-Time Logs

```bash
# All services
podman compose logs -f

# Specific service
podman compose logs -f coordinator

# Multiple services with wildcards
./scripts/logs.sh external-bridge-*
```

### Inspect Container

```bash
# Container details
podman inspect dev-coordinator

# Container stats
podman stats dev-coordinator
```

### Clean Slate

When all else fails, start fresh:

```bash
# Stop and remove everything
podman compose down -v

# Remove all images
podman system prune -a -f

# Rebuild and start
podman compose build --no-cache
podman compose up -d
```

## macOS-Specific Issues

### Podman Machine Not Running

**Problem:**
```
Error: cannot connect to podman socket
```

**Solution:**
```bash
podman machine start
```

### Volume Mount Performance

**Problem:**
Volume mounts are slow on macOS.

**Solution:**
This is a known limitation. Consider:
1. Using fewer volume mounts
2. Running on Linux for better performance
3. Using `:cached` mount option (experimental)

## Getting Help

If you're still stuck:

1. Check service logs: `podman compose logs [service-name]`
2. Verify configuration: `podman compose config`
3. Check system resources: `podman stats`
4. Review this guide's relevant section
5. Search for error messages in official documentation

For persistent issues, include:
- Complete error message
- Output of `podman compose logs`
- Your `.env` file (redact sensitive data)
- Output of `podman compose config`

