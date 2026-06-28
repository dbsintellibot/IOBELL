const fs = require('fs');
const files = [
  'src/screens/BroadcastScreen.tsx',
  'src/screens/DashboardScreen.tsx',
  'src/screens/ManualTriggerScreen.tsx',
  'src/screens/ProfileSwitcherScreen.tsx',
  'src/lib/supabase.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import AsyncStorage from '@react-native-async-storage\/async-storage';/g, "import SecureStorage from '../utils/SecureStorage';");
  // Some files like supabase might need different relative paths, but all these are in src/*, so src/lib/supabase.ts requires '../utils/SecureStorage'. Wait, lib and screens are at the same level in src. So '../utils/SecureStorage' works!
  content = content.replace(/AsyncStorage\./g, 'SecureStorage.');
  fs.writeFileSync(file, content);
});
console.log("Refactored successfully.");
