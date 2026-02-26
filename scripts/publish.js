import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packagesDir = path.join(rootDir, 'packages');

const isDryRun = process.argv.includes('--dry-run');

console.log(`Starting publish script${isDryRun ? ' (DRY RUN)' : ''}...`);

// 1. Read root package.json
const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

// 2. Determine new version
const currentVersion = rootPkg.version;
if (!currentVersion) {
  console.error('Error: Root package.json does not have a version field.');
  process.exit(1);
}

const versionParts = currentVersion.split('.');
const patch = parseInt(versionParts[2], 10);
const newVersion = `${versionParts[0]}.${versionParts[1]}.${patch + 1}`;

console.log(`Bumping version from ${currentVersion} to ${newVersion}...`);

// Update root package.json
if (!isDryRun) {
  rootPkg.version = newVersion;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
}

// 3. Update all workspace packages
const packages = fs.readdirSync(packagesDir).filter(f => fs.statSync(path.join(packagesDir, f)).isDirectory());

const INTERNAL_PREFIX = '@agonx402/';

packages.forEach(pkgName => {
  const pkgPath = path.join(packagesDir, pkgName, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVersion;

    ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
      if (pkg[depType]) {
        for (const [dep, ver] of Object.entries(pkg[depType])) {
          if (dep.startsWith(INTERNAL_PREFIX)) {
            pkg[depType][dep] = `^${newVersion}`;
          }
        }
      }
    });

    if (!isDryRun) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
    console.log(`Updated ${pkg.name} to version ${newVersion}`);
  }
});

// 4. Run commands
const runCommand = (cmd, errorMessage, runCwd = rootDir) => {
  console.log(`Running: ${cmd} in ${path.relative(rootDir, runCwd) || 'root'}`);
  if (!isDryRun) {
    try {
      execSync(cmd, { stdio: 'inherit', cwd: runCwd });
    } catch (error) {
      console.error(errorMessage);
      console.error(error.message);
      process.exit(1);
    }
  }
};

runCommand('npm install', 'Failed to update package-lock.json with npm install.');
runCommand('npm run build', 'Build failed.');

packages.forEach(pkgName => {
  const pkgDir = path.join(packagesDir, pkgName);
  if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
    // Determine flag based on environment: if we have CI, use provenance.
    const publishCmd = process.env.CI ? 'npm publish --access public --provenance' : 'npm publish --access public';
    runCommand(publishCmd, `Failed to publish ${pkgName}.`, pkgDir);
  }
});

if (!isDryRun) {
  try {
    console.log('\nCommitting and Tagging Release...');
    runCommand('git add .', 'Failed to add files to git.');
    runCommand(`git commit -m "chore(release): v${newVersion}"`, 'Failed to commit files.');
    runCommand(`git tag v${newVersion}`, `Failed to tag v${newVersion}.`);
    console.log('You can now push these changes and tags using `git push --follow-tags`.');
  } catch (e) {
    console.warn('\nSkipped git commit and tag. Is the workspace dirty or are you not in a git repo?');
  }
}

console.log(`\nSuccessfully bumped and ${isDryRun ? 'simulated publishing' : 'published'} version ${newVersion}!`);
