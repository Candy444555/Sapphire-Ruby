# LEXI PYTHON SCRIPT: apk_build
# Added: 2026-04-19T23:58:33.046Z
# Description: build APK file

import os
import subprocess

# create a new directory for the APK build
os.mkdir('/home/runner/workspace/lexi-projects/lexi-apk/build')

# run the Expo build command
subprocess.run(['expo', 'build', '-c', '--android', '--release-channel=alpha'])

# get the build URL from the Expo API
build_url = subprocess.check_output(['curl', '-s', '-X', 'POST', 'http://localhost:8080/api/build-apk', '-H', 'Content-Type: application/json', '-d', '{"projectName": "lexi-apk", "files": []}']).decode('utf-8')
build_url = build_url.split('"buildUrl": "')[1].split('"')[0]

# output the build URL
print('[PROJECT_DONE name="Lexi APK" path="/home/runner/workspace/lexi-projects/lexi-apk" mainFile="' + build_url + '" type="apk"]')