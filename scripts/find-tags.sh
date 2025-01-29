#!/bin/bash

# Usage:
# scripts/find-tags.sh

matching=$(grep -oP "tags:(\s)*\[\K[^\]]+" data/blog/* | cut -d " " -f 2- | tr -d " '" | tr ',' '\n' | sort -u)
echo "$matching"
