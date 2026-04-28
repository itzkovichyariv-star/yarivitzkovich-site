#!/usr/bin/env bash
# Creates a timestamped zip of the repo and drops it into OneDrive Ariel.
# Excludes node_modules / .astro / dist (rebuildable from source).
# Keeps the most recent 6 monthly snapshots; older ones are removed.
#
# Run manually:    npm run backup
# Or directly:     bash scripts/backup-to-onedrive.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="$(basename "$REPO_DIR")"
DATE_STAMP="$(date +%Y-%m-%d)"
ARCHIVE_NAME="${REPO_NAME}-backup-${DATE_STAMP}.zip"

# OneDrive backup destination (Ariel account)
BACKUP_DIR="$HOME/Library/CloudStorage/OneDrive-ariel.ac.il/Yariv/site-backups"

# Make sure the destination exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "→ Creating backup folder: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

cd "$REPO_DIR"

# Verify there are no uncommitted changes worth saving (advisory only)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠  Working tree has uncommitted changes — they'll be included in the zip."
fi

echo "→ Creating $ARCHIVE_NAME ..."
TMP="/tmp/${ARCHIVE_NAME}"

# zip everything except rebuildable artifacts and OS noise
# -r = recursive
# -X = no extra Mac attributes
# -q = quiet
# -x = exclude patterns
zip -rXq "$TMP" . \
  -x "node_modules/*" \
  -x ".astro/*" \
  -x "dist/*" \
  -x ".DS_Store" \
  -x "**/.DS_Store" \
  -x "**/node_modules/*"

# Move to OneDrive
mv "$TMP" "$BACKUP_DIR/$ARCHIVE_NAME"

# Report size
SIZE=$(du -h "$BACKUP_DIR/$ARCHIVE_NAME" | cut -f1)
echo "✓ Backup created: $BACKUP_DIR/$ARCHIVE_NAME ($SIZE)"

# Rotation: keep the 6 most-recent backups, delete older ones
echo "→ Rotating old backups (keeping 6 most recent)..."
cd "$BACKUP_DIR"
ls -t ${REPO_NAME}-backup-*.zip 2>/dev/null | tail -n +7 | while read -r old; do
  echo "  - removing $old"
  rm -f "$old"
done

# Final summary
echo ""
echo "Current backups in OneDrive:"
ls -lh ${REPO_NAME}-backup-*.zip 2>/dev/null | awk '{print "  " $9 "  (" $5 ")"}'

echo ""
echo "Done. OneDrive will sync the zip to Microsoft cloud automatically."
