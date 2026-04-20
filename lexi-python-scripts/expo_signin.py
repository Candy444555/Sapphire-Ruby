# LEXI PYTHON SCRIPT: expo_signin
# Added: 2026-04-20T02:11:34.306Z
# Description: sign into Expo and enable cloud APK builds

import os
import requests
import json

expo_token = os.environ.get("EXPO_TOKEN")
if expo_token is None:
    print("Error: EXPO_TOKEN is not set")
    exit(1)

url = "https://expo.dev/api/v2/projects/lexi-apk/builds"
headers = {
    "Authorization": f"Bearer {expo_token}",
    "Content-Type": "application/json"
}

response = requests.post(url, headers=headers)
if response.status_code == 201:
    print("Success: Signed into Expo and enabled cloud APK builds")
else:
    print(f"Error: {response.text}")