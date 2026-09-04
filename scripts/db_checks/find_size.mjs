import fs from 'fs';
import path from 'path';

function findFilesWithSize(dir, targetSize) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git' || file === '.venv') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(findFilesWithSize(fullPath, targetSize));
      } else if (stat.size === targetSize) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // ignore
  }
  return results;
}

const matchingFiles = findFilesWithSize('c:\\My Drive\\My Drive\\AutoBell', 24624);
console.log('Files with size 24624 bytes:', matchingFiles);
