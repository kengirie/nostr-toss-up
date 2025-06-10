import * as fs from 'fs';
import * as path from 'path';

// Read the input file
const inputPath = path.join(__dirname, 'existing-users.txt');
const outputPath = path.join(__dirname, 'cleaned-npubs.txt');

// Read the file content
const content = fs.readFileSync(inputPath, 'utf-8');

// Split into lines and process each line
const cleanedLines = content
  .split('\n')
  .map(line => {
    // Remove the number and dot at the start of each line
    return line.replace(/^\d+\.\s*/, '');
  })
  .filter(line => line.trim() !== ''); // Remove empty lines

// Write the cleaned content to a new file
fs.writeFileSync(outputPath, cleanedLines.join('\n'));

console.log('Cleaned npubs have been written to cleaned-npubs.txt');
