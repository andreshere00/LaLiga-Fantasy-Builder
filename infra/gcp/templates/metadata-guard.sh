#!/bin/bash
# Containers must not obtain the host's Secret Manager identity via metadata HTTP.
# DNS at the same link-local address is deliberately unaffected.
set -euo pipefail
iptables --wait -nL DOCKER-USER >/dev/null 2>&1 || iptables --wait -N DOCKER-USER
iptables --wait -C DOCKER-USER -d 169.254.169.254/32 -p tcp --dport 80 -j REJECT 2>/dev/null ||
  iptables --wait -I DOCKER-USER 1 -d 169.254.169.254/32 -p tcp --dport 80 -j REJECT
