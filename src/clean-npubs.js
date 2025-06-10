"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
// Read the input file
var inputPath = path.join(__dirname, 'existing-users.txt');
var outputPath = path.join(__dirname, 'cleaned-npubs.txt');
// Read the file content
var content = fs.readFileSync(inputPath, 'utf-8');
// Split into lines and process each line
var cleanedLines = content
    .split('\n')
    .map(function (line) {
    // Remove the number and dot at the start of each line
    return line.replace(/^\d+\.\s*/, '');
})
    .filter(function (line) { return line.trim() !== ''; }); // Remove empty lines
// Write the cleaned content to a new file
fs.writeFileSync(outputPath, cleanedLines.join('\n'));
console.log('Cleaned npubs have been written to cleaned-npubs.txt');
