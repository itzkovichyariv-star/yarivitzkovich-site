#!/bin/bash
# Add the IP of the network this script is run from to OWNER_IPS in
# wrangler.toml so the live site auto-recognises requests from this
# wifi as the owner — no cookie required.
#
# Run from any machine on the network you want to claim:
#   npm run claim-this-network
#
# The script:
#   1. Detects this machine's public IP (asks ifconfig.me).
#   2. Reads the OWNER_IPS = "..." line in wrangler.toml.
#   3. Appends the new IP if not already present.
#   4. Commits the change and pushes to main, which triggers the
#      Cloudflare Pages redeploy that picks up the new env var.
#
# After running, give Cloudflare ~30s to deploy, then any device on
# this network will see the owner panel automatically.
#
# IMPORTANT: this is patterned around POSIX-compatible regex
# ([[:space:]] rather than \s) so it works on the BSD versions of
# grep/sed/awk that ship with macOS, not just GNU on Linux.

set -e

cd "$(dirname "$0")/.."

# 1. Detect public IP. Try multiple services in case one is down.
IP=""
for svc in "https://ifconfig.me" "https://api.ipify.org" "https://icanhazip.com"; do
  IP=$(curl -s --max-time 5 "$svc" | tr -d ' \n\r')
  if [ -n "$IP" ]; then break; fi
done

if [ -z "$IP" ]; then
  echo "❌ Could not detect public IP. Are you online?"
  exit 1
fi

echo "→ This network's public IP: $IP"

# 2. Read the current OWNER_IPS line — pulls out the value between the
#    first pair of quotes.
CURRENT=$(sed -nE 's/^OWNER_IPS[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/p' wrangler.toml)
echo "→ Current OWNER_IPS value: \"$CURRENT\""

# 3. Bail out if this IP is already in the list.
case ",$CURRENT," in
  *",$IP,"*)
    echo "✓ $IP is already in OWNER_IPS — nothing to do."
    exit 0
    ;;
esac

if [ -z "$CURRENT" ]; then
  NEW="$IP"
else
  NEW="$CURRENT,$IP"
fi

echo "→ New OWNER_IPS value: \"$NEW\""

# 4. Replace the OWNER_IPS line in wrangler.toml.
awk -v new="$NEW" '
  /^OWNER_IPS[[:space:]]*=/ { print "OWNER_IPS = \"" new "\""; next }
  { print }
' wrangler.toml > wrangler.toml.tmp
mv wrangler.toml.tmp wrangler.toml

# Sanity check: the new file should contain our new value.
if ! grep -q "OWNER_IPS = \"$NEW\"" wrangler.toml; then
  echo "❌ Update failed — wrangler.toml still doesn't contain the new IP."
  echo "   File reverted; please report this bug."
  git checkout -- wrangler.toml
  exit 1
fi

# 5. Commit + push to trigger redeploy.
git add wrangler.toml
git commit -m "claim-this-network: add $IP to OWNER_IPS"
git push origin main

echo
echo "✅ Claimed. Cloudflare is redeploying now."
echo "   In ~30s, https://yarivitzkovich.org/live will auto-recognise"
echo "   any device on this network as the owner."
