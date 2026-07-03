#!/bin/sh
# Starts as root so the mounted Fly volume (/data, root-owned when created)
# can be handed to the non-root app user, then drops privileges.
set -e

if [ -d /data ]; then
  mkdir -p /data/uploads /data/leases /data/reports
  chown -R nyumba:nyumba /data
fi

exec su-exec nyumba "$@"
