#!/bin/bash
set -euo pipefail
if test "$(id -u)" -ne 0; then
  echo 'Run with sudo.' >&2
  exit 1
fi
umask 077
if systemctl is-active --quiet fantasybuilder.service; then
  systemctl reload fantasybuilder.service
else
  /usr/local/sbin/fantasybuilder-release
  # Failed initial releases must not enable a broken deployment on the next boot.
  touch /etc/fantasybuilder/enabled
  systemctl start fantasybuilder.service
fi
systemctl status fantasybuilder.service --no-pager
