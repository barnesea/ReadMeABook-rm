#!/bin/bash
# App startup wrapper for unified container
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

# Get PUID/PGID (default to node user's current IDs if not set)
PUID=${PUID:-$(id -u node)}
PGID=${PGID:-$(id -g node)}

echo "[App] Starting Next.js server..."
echo "[App] Process will run as UID:GID = $PUID:$PGID"

cd /app

# =============================================================================
# START SERVER WITH APPROPRIATE UID:GID HANDLING
# =============================================================================
# Three scenarios:
# 1. Docker / Rootful Podman: Running as root, use gosu to switch to PUID:PGID
# 2. Rootless Podman: Running as "root" in user namespace, skip gosu to preserve mapping
# 3. Non-root fallback: Already running as non-root, run directly

start_server() {
    if [ "$(id -u)" = "0" ]; then
        if is_user_namespace_root; then
            # Rootless container (e.g., rootless Podman)
            # Skip gosu - the user namespace already maps our "root" to the correct host UID
            echo "[App] Detected rootless container (user namespace with remapped root)"
            echo "[App] Skipping gosu to preserve user namespace UID mapping"
            echo "[App] Process will run as namespace UID 0 (mapped to host user)"
            node server.js &
        else
            # Normal container (Docker or rootful Podman)
            # Use gosu to switch to the specified PUID:PGID
            echo "[App] Switching to UID:GID $PUID:$PGID via gosu..."
            gosu "$PUID:$PGID" node server.js &
        fi
    else
        # Not running as root - run directly (fallback for unusual configurations)
        echo "[App] Warning: Not running as root, cannot use gosu. Running as current user ($(id -u):$(id -g))."
        node server.js &
    fi
}

# Start the server in background
start_server
SERVER_PID=$!

echo "[App] Waiting for server to be ready..."
sleep 5

# Initialize application services (creates default scheduled jobs)
echo "[App] Initializing application services..."
curl -sf http://localhost:3030/api/init || echo "[App] Warning: Failed to initialize services (may already be initialized)"

echo "[App] Server ready with PID $SERVER_PID"

# Verify the process is running with correct UID:GID (for debugging)
if [ -f "/proc/$SERVER_PID/status" ]; then
    ACTUAL_UID=$(grep '^Uid:' /proc/$SERVER_PID/status | awk '{print $2}')
    ACTUAL_GID=$(grep '^Gid:' /proc/$SERVER_PID/status | awk '{print $2}')
    echo "[App] Verified process credentials: UID=$ACTUAL_UID GID=$ACTUAL_GID"

    # Only warn about mismatch in non-rootless scenarios
    if ! is_user_namespace_root; then
        if [ "$ACTUAL_UID" != "$PUID" ] || [ "$ACTUAL_GID" != "$PGID" ]; then
            echo "[App] WARNING: Process UID:GID ($ACTUAL_UID:$ACTUAL_GID) does not match expected ($PUID:$PGID)"
        fi
    fi
fi

# Wait for server process (keeps the script running as long as the server is alive)
wait $SERVER_PID
