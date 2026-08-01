#!/usr/bin/env bash
# Deprecated: renamed to setup-work4you.sh in the Work4You brand migration.
# Kept so existing docs, bookmarks and muscle memory keep working.
echo "setup-wayne.sh is now setup-work4you.sh — running it for you." >&2
exec "$(dirname "$0")/setup-work4you.sh" "$@"
