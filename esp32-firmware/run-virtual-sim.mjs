import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('🚀 AutoBell ESP32-S3 Virtual Environment Helper');
console.log('====================================================\n');

const firmwareDir = path.resolve('esp32-firmware');
const targetElf = path.join(firmwareDir, '.pio', 'build', 'esp32_s3', 'firmware.elf');

try {
  console.log('📦 Compiling ESP32-S3 Firmware via PlatformIO...');
  const pioCmd = fs.existsSync('C:\\Users\\Muddasir\\AppData\\Roaming\\Python\\Python314\\Scripts\\pio.exe')
    ? '"C:\\Users\\Muddasir\\AppData\\Roaming\\Python\\Python314\\Scripts\\pio.exe" run -e esp32_s3'
    : 'pio run -e esp32_s3';
  execSync(pioCmd, { cwd: firmwareDir, stdio: 'inherit' });

  if (fs.existsSync(targetElf)) {
    const stats = fs.statSync(targetElf);
    console.log('\n====================================================');
    console.log('✅ FIRMWARE COMPILED SUCCESSFULLY FOR SIMULATION!');
    console.log(`📍 Output ELF: ${targetElf}`);
    console.log(`⏱️ Last Modified: ${stats.mtime.toLocaleString()}`);
    console.log('====================================================\n');
    console.log('🎮 HOW TO RUN VIRTUAL SIMULATION:');
    console.log('  Option 1 (VS Code Extension):');
    console.log('    - Open diagram.json in VS Code');
    console.log('    - Press F1 -> Select "Wokwi: Start Simulator"\n');
    console.log('  Option 2 (Wokwi CLI / Web):');
    console.log('    - Open https://wokwi.com/projects/new/esp32-s3');
    console.log('    - Upload diagram.json and firmware.elf');
    console.log('====================================================\n');
  } else {
    console.error('❌ Error: Compiled ELF file not found at ' + targetElf);
  }
} catch (err) {
  console.error('❌ Build failed during simulation compilation:', err.message);
  process.exit(1);
}
