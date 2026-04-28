#!/usr/bin/env bash
# Creates a timestamped zip of the repo and drops it into OneDrive Ariel.
# Excludes node_modules / .astro / dist (rebuildable from source).
# Idempotent: silently skips if a backup already exists for the current month.
# Keeps the most recent 6 monthly snapshots; older ones are removed.
#
# Run manually:                 npm run backup
# Force re-create today:        npm run backup -- --force
# Scheduled (launchd):          monthly + on login (whichever fires first)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="$(basename "$REPO_DIR")"
DATE_STAMP="$(date +%Y-%m-%d)"
MONTH_STAMP="$(date +%Y-%m)"
ARCHIVE_NAME="${REPO_NAME}-backup-${DATE_STAMP}.zip"

# OneDrive backup destination (Ariel account)
BACKUP_DIR="$HOME/Library/CloudStorage/OneDrive-ariel.ac.il/Yariv/site-backups"
# Log file lives in ~/Library/Logs/ (always writable; CloudStorage isn't reliably writable from launchd)
LOG_FILE="$HOME/Library/Logs/yarivitzkovich-site-backup.log"
mkdir -p "$(dirname "$LOG_FILE")"

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

# Ensure destination exists + verify it's actually writable (launchd sometimes can't reach OneDrive)
if [ ! -d "$BACKUP_DIR" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Creating backup folder: $BACKUP_DIR" | tee -a "$LOG_FILE"
  mkdir -p "$BACKUP_DIR" 2>/dev/null || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ ERROR: cannot create $BACKUP_DIR — likely Full Disk Access not granted to bash/launchd. Backup aborted." | tee -a "$LOG_FILE"
    exit 1
  }
fi
if ! touch "$BACKUP_DIR/.write-test" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ ERROR: $BACKUP_DIR not writable — likely Full Disk Access not granted to bash/launchd. Backup aborted." | tee -a "$LOG_FILE"
  exit 1
fi
rm -f "$BACKUP_DIR/.write-test"

# IDEMPOTENCY: skip if a backup already exists for this month
if [ "$FORCE" -eq 0 ]; then
  EXISTING=$(ls "$BACKUP_DIR"/${REPO_NAME}-backup-${MONTH_STAMP}-*.zip 2>/dev/null | tail -1 || true)
  if [ -n "$EXISTING" ]; then
    SIZE=$(du -h "$EXISTING" | cut -f1)
    AGE_DAYS=$(( ( $(date +%s) - $(stat -f %m "$EXISTING") ) / 86400 ))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skipped — already have $(basename "$EXISTING") ($SIZE, ${AGE_DAYS}d old). Use --force to override." | tee -a "$LOG_FILE"
    exit 0
  fi
fi

cd "$REPO_DIR"

# Verify there are no uncommitted changes worth knowing about (advisory)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠  Working tree has uncommitted changes — they'll be included in the zip."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Creating $ARCHIVE_NAME ..." | tee -a "$LOG_FILE"
TMP="/tmp/${ARCHIVE_NAME}"

# zip everything except rebuildable artifacts and OS noise
# -r = recursive, -X = no extra Mac attrs, -q = quiet, -x = exclude patterns
zip -rXq "$TMP" . \
  -x "node_modules/*" \
  -x ".astro/*" \
  -x "dist/*" \
  -x ".DS_Store" \
  -x "**/.DS_Store" \
  -x "**/node_modules/*" \
  -x "*.tmp" \
  -x "package.json.tmp"

# Verify the zip is not corrupt before declaring success
if ! unzip -tq "$TMP" >/dev/null 2>&1; then
  echo "✗ Backup verification FAILED — zip is corrupt. Aborting." | tee -a "$LOG_FILE"
  rm -f "$TMP"
  exit 1
fi

# Move to OneDrive (atomic on same volume; safe to interrupt mid-zip)
mv "$TMP" "$BACKUP_DIR/$ARCHIVE_NAME"

SIZE=$(du -h "$BACKUP_DIR/$ARCHIVE_NAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Backup created: $ARCHIVE_NAME ($SIZE)" | tee -a "$LOG_FILE"

# Rotation: keep the 6 most recent backups, delete older ones
cd "$BACKUP_DIR"
to_remove=$(ls -t ${REPO_NAME}-backup-*.zip 2>/dev/null | tail -n +7)
if [ -n "$to_remove" ]; then
  echo "→ Rotating old backups (keeping 6 most recent)..."
  echo "$to_remove" | while read -r old; do
    [ -n "$old" ] && {
      echo "  - removing $old"
      rm -f "$old"
    }
  done
fi

echo ""
echo "Current backups in OneDrive:"
ls -lh ${REPO_NAME}-backup-*.zip 2>/dev/null | awk '{print "  " $9 "  (" $5 ")"}'

echo ""
echo "Done. OneDrive will sync to Microsoft cloud automatically."
