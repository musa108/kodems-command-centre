#!/bin/sh
# Starts local PostgreSQL+PostGIS and Redis for development/testing (sandbox helper; docker-compose is the supported route).
service postgresql start >/dev/null 2>&1; i=0; until su postgres -c "psql -qc 'select 1'" >/dev/null 2>&1 || [ $i -ge 20 ]; do sleep 1; i=$((i+1)); done
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null 2>&1; sleep 1; redis-cli ping
