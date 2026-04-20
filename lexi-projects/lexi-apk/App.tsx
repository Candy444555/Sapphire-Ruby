_ec=$?
printf '__DONE_a2956bdc526b05fd02678e3f__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/app.json; } 2>&1
_ec=$?
printf '__DONE_a06f85df27aa08a0780b2247__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/package.json; } 2>&1
_ec=$?
printf '__DONE_3b975f059e41deb44bc7fd65__:%d:%s__END__\n' $_ec "$(pwd)"
{ curl -s -X POST http://localhost:8080/api/build-apk   -H "Content-Type: application/json"   -d "$(node -e "
const fs = require('fs');
const dir = '/home/runner/workspace/lexi-projects/lexi-apk/';
const files = fs.readdirSync(dir).map(f => ({
  path: f,
  content: fs.readFileSync(dir + '/' + f, 'utf8')
}));
console.log(JSON.stringify({ projectName: 'Lexi APK', files }));
")"; } 2>&1
_ec=$?
printf '__DONE_7fdec6a17589c95b20a2a6df__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/eas.json; } 2>&1
_ec=$?
printf '__DONE_a559b11cdb8d32db6c4b708c__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo 'RESPONSE_JSON' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('buildUrl:', d.buildUrl); console.log('easBuildId:', d.easBuildId);"; } 2>&1
_ec=$?
printf '__DONE_11ddf44f0c6de4c89e4dee9d__:%d:%s__END__\n' $_ec "$(pwd)"
{ curl -v -s -X POST http://localhost:8080/api/build-apk   -H "Content-Type: application/json"   -d "$(node -e "
const fs = require('fs');
const dir = '/home/runner/workspace/lexi-projects/lexi-apk/';
const files = fs.readdirSync(dir).map(f => ({
  path: f,
  content: fs.readFileSync(dir + '/' + f, 'utf8')
}));
console.log(JSON.stringify({ projectName: 'Lexi APK', files }));
")"; } 2>&1
_ec=$?
printf '__DONE_89b51b44f648b1575bc1c8f3__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo 'import React from \'react\'; import { View, Text, Button } from \'react-native\'; import { Lexi } from \'./lexi\'; const lex = new Lexi(); export default function App() { return (<View style={{ flex: 1, justifyContent: \'center\', alignItems: \'center\' }}><Text>Lexi</Text><Button title="Talk to Lexi" onPress={() => lex.run()} /></View>); }' > /home/runner/workspace/lexi-projects/lexi-apk/App.tsx; } 2>&1
_ec=$?
printf '__DONE_819c87e90801cdc6b7eaa38b__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo 'RESPONSE_JSON' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('buildUrl:', d.buildUrl); console.log('easBuildId:', d.easBuildId);"; } 2>&1
_ec=$?
printf '__DONE_60c4c6c548e635f855d32a98__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo '{ "expo": { "name": "Lexi", "slug": "lexi", "version": "1.0.0", "orientation": "portrait", "icon": "./assets/icon.png", "splash": { "image": "./assets/splash.png", "resizeMode": "contain", "backgroundColor": "#ffffff" }, "updates": { "fallbackToCacheTimeout": 0 } }, "android": { "package": "com.example.lexi" } }' > /home/runner/workspace/lexi-projects/lexi-apk/app.json; } 2>&1
_ec=$?
printf '__DONE_ec8f3ec1b15b541cb5c7c620__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo '{ "name": "lexi", "version": "1.0.0", "private": true, "scripts": { "start": "expo start", "build": "expo build:android" }, "dependencies": { "expo": "^53.0.0", "react": "17.0.2", "react-dom": "17.0.2", "react-native": "0.64.3" } }' > /home/runner/workspace/lexi-projects/lexi-apk/package.json; } 2>&1
_ec=$?
printf '__DONE_f3fdeed63dc6eb706b812375__:%d:%s__END__\n' $_ec "$(pwd)"
{ npm install -g expo-cli; } 2>&1
_ec=$?
printf '__DONE_60a5269763184a0e0d78732f__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo '{ "expo": { "projectId": "lexi-1234567890", "buildType": "apk", "profile": "preview" } }' > /home/runner/workspace/lexi-projects/lexi-apk/eas.json; } 2>&1
_ec=$?
printf '__DONE_15eef4294f577dbc106a9560__:%d:%s__END__\n' $_ec "$(pwd)"
{ cd /home/runner/workspace/lexi-projects/lexi-apk; } 2>&1
_ec=$?
printf '__DONE_eb215b12ac5b474e8c607201__:%d:%s__END__\n' $_ec "$(pwd)"
{ curl -s -X POST http://localhost:8080/api/build-apk   -H "Content-Type: application/json"   -d "$(node -e "
const fs = require('fs');
const dir = '/home/runner/workspace/lexi-projects/lexi-apk/';
const files = fs.readdirSync(dir).map(f => ({
  path: f,
  content: fs.readFileSync(dir + '/' + f, 'utf8')
}));
console.log(JSON.stringify({ projectName: 'Lexi', files }));
")"; } 2>&1
_ec=$?
printf '__DONE_12b80433ac4a6ba740928b99__:%d:%s__END__\n' $_ec "$(pwd)"
{ expo build:android; } 2>&1
_ec=$?
printf '__DONE_de847b5a144bbd9304c4f7be__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo 'RESPONSE_JSON' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('buildUrl:', d.buildUrl); console.log('easBuildId:', d.easBuildId);"; } 2>&1
_ec=$?
printf '__DONE_49de11d662e81b217e6e32e0__:%d:%s__END__\n' $_ec "$(pwd)"
{ cd android; } 2>&1
_ec=$?
printf '__DONE_f825d6051c467de9ea5c4e6d__:%d:%s__END__\n' $_ec "$(pwd)"
{ curl -s -X GET $buildUrl -o /home/runner/workspace/lexi-apk/lexi.apk; } 2>&1
_ec=$?
printf '__DONE_1f2f6cf162585f10c0fbc458__:%d:%s__END__\n' $_ec "$(pwd)"
{ ls; } 2>&1
_ec=$?
printf '__DONE_b95cc9050439d9dda50290d4__:%d:%s__END__\n' $_ec "$(pwd)"
{ apksigner verify app-release.apk; } 2>&1
_ec=$?
printf '__DONE_e205f92c43f7b1ef53cffac0__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/App.tsx; } 2>&1
_ec=$?
printf '__DONE_cfa7ab66c252a6fd90510a0f__:%d:%s__END__\n' $_ec "$(pwd)"
{ npm install -g expo-cli --verbose; } 2>&1
_ec=$?
printf '__DONE_1a499330b0f8b6041eea0a20__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/app.json; } 2>&1
_ec=$?
printf '__DONE_bc860f09c3d9b5fdfc0cac42__:%d:%s__END__\n' $_ec "$(pwd)"
{ expo build:android --verbose; } 2>&1
_ec=$?
printf '__DONE_e8009ae913c6dde6e565f0ac__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/package.json; } 2>&1
_ec=$?
printf '__DONE_3f117ac034a93bf9497ba036__:%d:%s__END__\n' $_ec "$(pwd)"
{ apksigner verify app-release.apk --verbose; } 2>&1
_ec=$?
printf '__DONE_b38de841f8fc7ced1bc541e8__:%d:%s__END__\n' $_ec "$(pwd)"
{ cat > /home/runner/workspace/lexi-projects/lexi-apk/eas.json; } 2>&1
_ec=$?
printf '__DONE_0cba3f2464a8c16b71ed2026__:%d:%s__END__\n' $_ec "$(pwd)"
{ curl -s -X POST http://localhost:8080/api/build-apk   -H "Content-Type: application/json"   -d "$(node -e "
const fs = require('fs');
const dir = '/home/runner/workspace/lexi-projects/lexi-apk/';
const files = fs.readdirSync(dir).map(f => ({
  path: f,
  content: fs.readFileSync(dir + '/' + f, 'utf8')
}));
console.log(JSON.stringify({ projectName: 'Lexi', files }));
")"; } 2>&1
_ec=$?
printf '__DONE_c442ae974e8db48d847dbe78__:%d:%s__END__\n' $_ec "$(pwd)"
{ apt-get install -y android-sdk; } 2>&1
_ec=$?
printf '__DONE_9e8feac7b06c492b1033cbc7__:%d:%s__END__\n' $_ec "$(pwd)"
{ echo 'RESPONSE_JSON' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('buildUrl:', d.buildUrl); console.log('easBuildId:', d.easBuildId);"; } 2>&1
_ec=$?
printf '__DONE_854fe8525b36ece220ca7bea__:%d:%s__END__\n' $_ec "$(pwd)"
{ cd /home/runner/workspace/lexi-projects/lexi-apk; } 2>&1
_ec=$?
printf '__DONE_7dc9aa12e233e3130eec0510__:%d:%s__END__\n' $_ec "$(pwd)"
