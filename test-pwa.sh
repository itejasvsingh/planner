#!/bin/bash
# Find the bundle ID for the webapp
APP_ID=$(xcrun simctl listapps booted | grep "WebBookmark" | sed -n 's/.*"\([^"]*\)".*/\1/p' | head -n 1)
echo "Found app: $APP_ID"
if [ ! -z "$APP_ID" ]; then
  xcrun simctl launch booted "$APP_ID"
  sleep 10
  xcrun simctl io booted screenshot /Users/tejasv/align-app/pwa-standalone.png
else
  echo "No PWA found"
fi
