const { execSync } = require('child_process');
const path = "c:/Users/Rohit sahu/Desktop/demoPages/Group3_Team1";

try {
  console.log("1. Aborting merge...");
  execSync(`git -C "${path}" merge --abort`, { stdio: 'inherit' });
} catch(e) {}

try {
  console.log("2. Discarding local changes...");
  execSync(`git -C "${path}" checkout -- .`, { stdio: 'inherit' });
  execSync(`git -C "${path}" clean -fd`, { stdio: 'inherit' });
} catch(e) {}

console.log("3. Fetching origin...");
execSync(`git -C "${path}" fetch origin`, { stdio: 'inherit' });

console.log("4. Checkout main and reset to origin/main...");
execSync(`git -C "${path}" checkout main`, { stdio: 'inherit' });
execSync(`git -C "${path}" reset --hard origin/main`, { stdio: 'inherit' });

console.log("5. Creating fresh branch...");
execSync(`git -C "${path}" checkout -b Rohit-Sahu`, { stdio: 'inherit' });

console.log("\n===== DONE! =====");
console.log(execSync(`git -C "${path}" log --oneline -5`, { encoding: 'utf8' }));
