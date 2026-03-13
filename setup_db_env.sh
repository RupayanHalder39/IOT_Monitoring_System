#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/Users/rupayan/IOT_Monitoring_System"
CREDS_FILE="/Users/rupayan/db_creds.txt"
ENV_DEMO="${PROJECT_ROOT}/.env_demo"
ENV_FILE="${PROJECT_ROOT}/.env"
GITIGNORE="${PROJECT_ROOT}/.gitignore"

log() {
  printf '%s\n' "$*"
}

err() {
  printf 'ERROR: %s\n' "$*" >&2
}

# 1) Create db_creds.txt outside repo
if [ -e "$CREDS_FILE" ]; then
  log "db_creds.txt already exists at: $CREDS_FILE"
else
  cat > "$CREDS_FILE" <<'EOC'
DB_HOST=localhost
DB_USER=iot_user
DB_PASSWORD=mypassword123
DB_NAME=iot_monitoring
EOC
  log "Created db_creds.txt at: $CREDS_FILE"
fi

# 2) Copy .env_demo to .env
if [ ! -f "$ENV_DEMO" ]; then
  err ".env_demo not found at $ENV_DEMO"
  exit 1
fi

cp "$ENV_DEMO" "$ENV_FILE"
log "Created/updated .env from .env_demo at: $ENV_FILE"

# 3) Read credentials and update .env
if [ ! -f "$CREDS_FILE" ]; then
  err "db_creds.txt not found at $CREDS_FILE"
  exit 1
fi

DB_HOST=""
DB_USER=""
DB_PASSWORD=""
DB_NAME=""

while IFS= read -r line; do
  case "$line" in
    DB_HOST=*) DB_HOST="${line#DB_HOST=}" ;;
    DB_USER=*) DB_USER="${line#DB_USER=}" ;;
    DB_PASSWORD=*) DB_PASSWORD="${line#DB_PASSWORD=}" ;;
    DB_NAME=*) DB_NAME="${line#DB_NAME=}" ;;
  esac
done < "$CREDS_FILE"

if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
  err "Missing one or more DB_* values in $CREDS_FILE"
  exit 1
fi

# Update .env values (double-quoted) - macOS sed requires -i ''
sed -i '' "s/^DB_HOST=.*/DB_HOST=\"${DB_HOST}\"/" "$ENV_FILE"
sed -i '' "s/^DB_USER=.*/DB_USER=\"${DB_USER}\"/" "$ENV_FILE"
sed -i '' "s/^DB_PASSWORD=.*/DB_PASSWORD=\"${DB_PASSWORD}\"/" "$ENV_FILE"
sed -i '' "s/^DB_NAME=.*/DB_NAME=\"${DB_NAME}\"/" "$ENV_FILE"

log "Updated .env with credentials from db_creds.txt"

# 4) Ensure .env is in .gitignore
if [ ! -f "$GITIGNORE" ]; then
  touch "$GITIGNORE"
fi

if ! grep -qx '\.env' "$GITIGNORE"; then
  printf '\n.env\n' >> "$GITIGNORE"
  log "Added .env to .gitignore"
else
  log ".env already present in .gitignore"
fi

log "Done."
