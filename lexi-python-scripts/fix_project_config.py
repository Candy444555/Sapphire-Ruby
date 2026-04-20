# LEXI PYTHON SCRIPT: fix_project_config
# Added: 2026-04-20T02:12:16.517Z
# Description: fix project configuration files

import os
import json

project_dir = "/home/runner/workspace/lexi-projects/lexi-apk"
app_json = os.path.join(project_dir, "app.json")
eas_json = os.path.join(project_dir, "eas.json")

# Fix app.json
with open(app_json, "r") as f:
    app_config = json.load(f)
app_config["name"] = "Lexi APK"
app_config["slug"] = "lexi-apk"
app_config["android"] = {"package"]": "com.lexi.apk"}

with open(app_json, "w") as f:
    json.dump(app_config, f, indent=4)

# Fix eas.json
with open(eas_json, "r") as f:
    eas_config = json.load(f)
eas_config["previewProfile"] = "default"
eas_config["android"] = {"buildType": "apk"}

with open(eas_json, "w") as f:
    json.dump(eas_config, f, indent=4)

print("Project configuration files fixed")