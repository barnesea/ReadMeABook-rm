#!/bin/bash
# Redis startup wrapper for unified container
# Uses gosu to ensure correct PUID:PGID for file operations
#
# Supports:
# - Docker: Uses gosu to switch to PUID:PGID
# - Rootful Podman: Uses gosu to switch to PUID:PGID (same as Docker)
# - Rootless Podman: Skips gosu to preserve user namespace UID mapping

set -e

# =============================================================================
# USER NAMESPACE DETECTION
# =============================================================================
# Detects if running in a user namespace where UID 0 is remapped to a non-root
# user on the host (e.g., rootless Podman). In this case, using gosu would
# cause a double-mapping that breaks volume permissions.
#
# How it works:
# - /proc/self/uid_map shows the UID mapping for the current namespace
# - Format: <uid-inside-ns> <uid-outside-ns> <range>
# - In a normal container: "0 0 4294967295" (root maps to root)
# - In rootless Podman:    "0 1000 1" (root maps to host user 1000)
#
# Returns 0 (true) if in a user namespace with remapped root, 1 (false) otherwise
# =============================================================================
is_user_namespace_root() {
    if [ -f /proc/self/uid_map ]; then
        # Read the first mapping line (covers UID 0)
        read -r inside outside count < /proc/self/uid_map
        # Trim whitespace (uid_map has leading spaces for alignment)
        inside=$(echo "$inside" | xargs)
        outside=$(echo "$outside" | xargs)
        # If UID 0 inside maps to non-0 outside, we're in a user namespace
        if [ "$inside" = "0" ] && [ "$outside" != "0" ]; then
            return 0  # true - rootless container detected
        fi
    fi
    return 1  # false - normal container (Docker or rootful Podman)
}

# Load environment from /etc/environment (set by entrypoint)
if [ -f /etc/environment ]; then
    set -a
    source /etc/environment
    set +a
fi

# Get PUID/PGID (default to redis user's current IDs if not set)
PUID=${PUID:-$(id -u redis)}
PGID=${PGID:-$(id -g redis)}

echo "[Redis] Starting Redis server..."
echo "[Redis] Process will run as UID:GID = $PUID:$PGID"

# =============================================================================
# START REDIS WITH APPROPRIATE UID:GID HANDLING
# =============================================================================
# Three scenarios:
# 1. Docker / Rootful Podman: Running as root, use gosu to switch to PUID:PGID
# 2. Rootless Podman: Running as "root" in user namespace, skip gosu to preserve mapping
# 3. Non-root fallback: Already running as non-root, run directly

REDIS_CMD="/usr/bin/redis-server --appendonly yes --dir /var/lib/redis --bind 127.0.0.1 --port 6379"

if [ "$(id -u)" = "0" ]; then
    if is_user_namespace_root; then
        # Rootless container (e.g., rootless Podman)
        # Skip gosu - the user namespace already maps our "root" to the correct host UID
        echo "[Redis] Detected rootless container (user namespace with remapped root)"
        echo "[Redis] Skipping gosu to preserve user namespace UID mapping"
        echo "[Redis] Process will run as namespace UID 0 (mapped to host user)"
        exec $REDIS_CMD
    else
        # Normal container (Docker or rootful Podman)
        # Use gosu to switch to the specified PUID:PGID
        echo "[Redis] Switching to UID:GID $PUID:$PGID via gosu..."
        exec gosu "$PUID:$PGID" $REDIS_CMD
    fi
else
    # Not running as root - run directly (fallback for unusual configurations)
    echo "[Redis] Warning: Not running as root, cannot use gosu. Running as current user ($(id -u):$(id -g))."
    exec $REDIS_CMD
fi
