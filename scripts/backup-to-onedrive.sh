#!/usr/bin/env bash
# Creates a timestamped zip of the repo and drops it into OneDrive Ariel.
# Excludes node_modules / .astro / dist (rebuildable from source).
# Idempotent: silently skips if a backup already exists for the current month.
# Keeps the 6 newest backups; older ones are removed (oldest first). Works under
# launchd too, via a manifest (see MANIFEST below).
#
# Run manually:                 npm run backup
# Force re-create today:        npm run backup -- --force
# Scheduled (launchd):          monthly + on login (whichever fires first)

set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="$(basename "$REPO_DIR")"
DATE_STAMP="$(date +%Y-%m-%d)"
MONTH_STAMP="$(date +%Y-%m)"
ARCHIVE_NAME="${REPO_NAME}-backup-${DATE_STAMP}.zip"

# OneDrive backup destination (Ariel account)
BACKUP_DIR="${BACKUP_DIR_OVERRIDE:-$HOME/Library/CloudStorage/OneDrive-ariel.ac.il/Yariv/Applications/Website/site-backups}"
# Log file lives in ~/Library/Logs/ (always writable; CloudStorage isn't reliably writable from launchd)
LOG_FILE="$HOME/Library/Logs/yarivitzkovich-site-backup.log"
mkdir -p "$(dirname "$LOG_FILE")"
# Manifest of backups this script has created. Under launchd the script can write
# into OneDrive but cannot LIST it (ls comes back empty), so the monthly skip and
# the rotation read this file as well as the folder. One archive name per line.
MANIFEST="${MANIFEST_OVERRIDE:-$HOME/Library/Application Support/yarivitzkovich-site-backup/manifest.txt}"
mkdir -p "$(dirname "$MANIFEST")"
touch "$MANIFEST"
KEEP=6

# Every backup we know of: what the folder shows (when it can be listed) plus the
# manifest. Names carry the date, so a plain sort is oldest → newest.
known_backups() {
  { ls "$BACKUP_DIR" 2>/dev/null; cat "$MANIFEST"; } \
    | grep -E "^${REPO_NAME}-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}\.zip$" | sort -u
}

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

# Ensure destination exists + verify it's actually writable (launchd sometimes can't reach OneDrive)
if [ ! -d "$BACKUP_DIR" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Creating backup folder: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR" 2>/dev/null || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ ERROR: cannot create $BACKUP_DIR — likely Full Disk Access not granted to bash/launchd. Backup aborted."
    exit 1
  }
fi
if ! touch "$BACKUP_DIR/.write-test" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ ERROR: $BACKUP_DIR not writable — likely Full Disk Access not granted to bash/launchd. Backup aborted."
  exit 1
fi
rm -f "$BACKUP_DIR/.write-test"

# IDEMPOTENCY: skip if a backup already exists for this month
if [ "$FORCE" -eq 0 ]; then
  EXISTING=$(known_backups | grep -F -- "-backup-${MONTH_STAMP}-" | tail -1 || true)
  if [ -n "$EXISTING" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skipped — already have $EXISTING for ${MONTH_STAMP}. Use --force to override."
    exit 0
  fi
fi

cd "$REPO_DIR"

# Verify there are no uncommitted changes worth knowing about (advisory)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠  Working tree has uncommitted changes — they'll be included in the zip."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Creating $ARCHIVE_NAME ..."
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
  echo "✗ Backup verification FAILED — zip is corrupt. Aborting."
  rm -f "$TMP"
  exit 1
fi

# Move to OneDrive (atomic on same volume; safe to interrupt mid-zip)
mv "$TMP" "$BACKUP_DIR/$ARCHIVE_NAME"

SIZE=$(du -h "$BACKUP_DIR/$ARCHIVE_NAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Backup created: $ARCHIVE_NAME ($SIZE)"
echo "$ARCHIVE_NAME" >> "$MANIFEST"

# Rotation: keep the $KEEP newest backups, delete the rest (oldest first).
# Deletes by exact name, which works under launchd even though listing does not.
count=$(known_backups | wc -l | tr -d ' ')
to_remove=""
if [ "$count" -gt "$KEEP" ]; then
  to_remove=$(known_backups | head -n $((count - KEEP)))
fi
if [ -n "$to_remove" ]; then
  echo "→ Rotating old backups (keeping $KEEP most recent)..."
  echo "$to_remove" | while read -r old; do
    [ -n "$old" ] || continue
    echo "  - removing $old"
    rm -f "${BACKUP_DIR:?}/${old:?}"
    grep -vxF -- "$old" "$MANIFEST" > "$MANIFEST.tmp"; mv "$MANIFEST.tmp" "$MANIFEST"
  done
fi
# Record every kept backup, so a later launchd run (which sees only the manifest)
# still knows the older ones and can rotate them out.
known_backups > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"

echo ""
echo "Backups kept:"
known_backups | sed 's/^/  /'

echo ""
echo "Done. OneDrive will sync to Microsoft cloud automatically."
exit 0
