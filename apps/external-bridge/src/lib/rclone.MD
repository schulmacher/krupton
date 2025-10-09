# Rclone Setup Guide

This guide explains how to set up rclone with Google Drive on macOS and Ubuntu Linux.

## Installation

### macOS

```bash
brew install rclone
```

### Ubuntu Linux

```bash
sudo apt update
sudo apt install rclone
```

Or download the latest version directly:

```bash
curl https://rclone.org/install.sh | sudo bash
```

## Configuring Google Drive

After installation, configure rclone to connect to your personal Google Drive account.

### 1. Start Configuration

```bash
rclone config
```

### 2. Create New Remote

When prompted, choose:

```
n) New remote
```

### 3. Name Your Remote

Enter a name for your remote (e.g., `gdrive`):

```
name> gdrive
```

**Note**: This name will be used in your environment variables (`RCLONE_REMOTE_NAME`).

### 4. Choose Storage Type

Select Google Drive from the list:

```
Storage> drive
```

Or enter the number corresponding to "Google Drive" (usually `15` or similar).

### 5. Configure Client ID and Secret (Optional)

For personal use, you can skip this by pressing Enter twice:

```
client_id> [Press Enter]
client_secret> [Press Enter]
```

**Note**: Using your own OAuth Client ID provides better performance and higher quotas. See "Advanced: Custom OAuth Client" below.

**Configuring client_secret gave full access to my personal storage**

### 6. Choose Scope

**For backup storage (recommended)**, select Application Data folder:

```
scope> 4
```

This restricts access to a hidden, app-specific folder in Google Drive that's isolated from your personal files.

**Alternatively**, for full drive access (requires OAuth verification):

```
scope> 1
```

**Scope Options:**
- `1` - Full access to all files, excluding Application Data Folder (**Restricted** - requires [OAuth verification](https://support.google.com/cloud/answer/9110914))
- `2` - Read-only access to file metadata and file contents
- `3` - Access to files created by rclone only (visible in Drive website, per-file authorization)
- `4` - Application Data folder - **Recommended** for backup storage (isolated, hidden, secure, no verification needed)
- `5` - Read-only access to file metadata only

**Why use Application Data folder (scope 4)?**
- ✅ More secure - isolated from your personal Drive files
- ✅ Hidden from Drive UI - users can't accidentally delete backups
- ✅ No OAuth verification required (non-sensitive scope)
- ✅ Perfect for system-managed backup storage
- ✅ Full CRUD operations (create, read, update, delete)

See [Google Drive API Scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) for more details.

### 7. Root Folder ID

Leave blank for full drive access:

```
root_folder_id> [Press Enter]
```

### 8. Service Account File

For personal accounts, leave blank:

```
service_account_file> [Press Enter]
```

### 9. Advanced Config

Skip advanced config:

```
Edit advanced config? (y/n)> n
```

### 10. Auto Config

#### On macOS (Local Development)

Choose yes to use auto config:

```
Use auto config? (y/n)> y
```

This will open your browser for Google authentication.

#### On Ubuntu Linux (Remote Server/VPS)

If you're on a remote server without a browser, choose no:

```
Use auto config? (y/n)> n
```

Then:
1. Copy the long URL that appears
2. Paste it into a browser on your local machine
3. Authenticate with Google
4. Copy the verification code
5. Paste it back into the terminal

### 11. Configure as Team Drive

For personal accounts, choose no:

```
Configure this as a team drive? (y/n)> n
```

### 12. Confirm Configuration

Review your configuration and confirm:

```
Yes this is OK (y/n)> y
```

### 13. Quit Config

```
q) Quit config
```

## Testing the Connection

### List Files

```bash
rclone ls gdrive:
```

### List Directories

```bash
rclone lsd gdrive:
```

### Create a Test Directory

```bash
rclone mkdir gdrive:rclone-test
```

### List Files in a Specific Directory

```bash
rclone ls gdrive:backups
```

## Environment Variables

After configuration, set these environment variables for the application:

```bash
# Enable cloud sync
export CLOUD_SYNC_ENABLED=true

# Remote name (from step 3)
export RCLONE_REMOTE_NAME=gdrive

# Remote path (directory in Google Drive)
export RCLONE_REMOTE_PATH=backups

# Local temp directory for cloud operations
export CLOUD_BACKUP_TEMP_DIR=/tmp/cloud-backup-temp
```

Add these to your shell profile (`~/.zshrc` on macOS, `~/.bashrc` on Ubuntu) to make them persistent.

## Advanced: Custom OAuth Client

Using your own OAuth Client ID provides better performance and avoids rate limits.

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. Configure OAuth consent screen:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" for personal accounts
   - Fill in required fields (app name, user support email, developer contact)
   - **Add scopes**:
     - For **backup storage** (recommended): `https://www.googleapis.com/auth/drive.appdata`
     - For **full drive access**: `https://www.googleapis.com/auth/drive`
   - Click "Save and Continue"
   - Add your email as a test user (in development mode)
5. Create OAuth credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as application type
   - Give it a name (e.g., "rclone-backup")
   - Click "Create"
6. Download the credentials or copy the Client ID and Client Secret

### 2. Reconfigure Rclone

```bash
rclone config
```

Choose your existing remote and edit it, then enter your Client ID and Secret when prompted.

**Note:** If you use the `drive.appdata` scope in your OAuth client, make sure to select scope `4` (Application Data folder) when configuring rclone (step 6 above).

## Troubleshooting

### "rclone: command not found"

Ensure rclone is installed and in your PATH:

```bash
which rclone
```

If not found, reinstall following the installation steps above.

### Authentication Errors

If you get authentication errors, try reconfiguring:

```bash
rclone config reconnect gdrive:
```

Or delete and recreate the remote:

```bash
rclone config delete gdrive
rclone config
```

### Rate Limiting

If you encounter rate limits:

1. Set up your own OAuth Client ID (see above)
2. Add retry flags to commands:
   ```bash
   rclone sync --retries 10 --low-level-retries 10
   ```

### Permission Denied

Ensure the remote directory exists:

```bash
rclone mkdir gdrive:backups
```

### Checking Configuration

View your current rclone configuration:

```bash
rclone config show
```

The config file is located at:
- macOS: `~/.config/rclone/rclone.conf`
- Linux: `~/.config/rclone/rclone.conf`

## Common Commands

```bash
# List all configured remotes
rclone listremotes

# Check quota
rclone about gdrive:

# Copy file to Google Drive
rclone copy /path/to/file.txt gdrive:backups/

# Copy file from Google Drive
rclone copy gdrive:backups/file.txt /local/path/

# Sync directory (one-way)
rclone sync /local/dir gdrive:backups/

# Delete file
rclone deletefile gdrive:backups/file.txt

# Delete directory and contents
rclone purge gdrive:backups/old-folder/
```

## Security Notes

- The rclone configuration file contains authentication tokens
- Keep `~/.config/rclone/rclone.conf` secure
- Never commit this file to version control
- On shared systems, ensure proper file permissions:
  ```bash
  chmod 600 ~/.config/rclone/rclone.conf
  ```

## Further Reading

- [Rclone Google Drive Documentation](https://rclone.org/drive/)
- [Rclone Commands Reference](https://rclone.org/commands/)
- [Rclone FAQ](https://rclone.org/faq/)
