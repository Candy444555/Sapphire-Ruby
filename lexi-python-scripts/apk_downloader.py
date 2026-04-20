# LEXI PYTHON SCRIPT: apk_downloader
# Added: 2026-04-20T04:51:32.695Z
# Description: download APK from GitHub

import os
import requests

def downloadApk(repoUrl, actionsUrl):
  response = requests.get(actionsUrl)
  apkName = actionsUrl.split('/')[-1]
  with open(apkName, 'wb') as f:
    f.write(response.content)
  return apkName

module.exports = downloadApk;