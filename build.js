const archiver = require('archiver');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const process = require('node:process');

const OUTPUTDIR = 'output';
const buildConfigs = [
  {
    name: 'webextension',
    extraManifests: ['manifest.webext.json'],
  },
  {
    name: 'chrome',
    extraManifests: ['manifest.chrome.json'],
  },
];

const versionRegex = /^\d+(\.\d+)?(\.\d+)?(\.\d+)?$/;
const cliArgs = process.argv.slice(2);

const appVersion = (() => {
  let version = '';
  if (cliArgs.length === 0) {
    // Fall back to Git tag for version, if no version is provided.
    version = childProcess.execSync(
      "git describe --match 'v[0-9]*' --abbrev=0 HEAD",
      {
        encoding: 'utf-8',
      },
    );
  } else {
    version = cliArgs[0];
  }

  version = version.replace(/^v/, '').replace('\n', '');
  if (!versionRegex.test(version)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  console.error(`Version: ${version}`);
  return version;
})();

async function buildManifest(target, sources) {
  // Read manifest files
  const manifestContents = await Promise.all(
    sources.map((filename) => fsp.readFile(filename, 'utf-8')),
  );

  // Merge manifests
  const manifest = {};
  for (const contents of manifestContents) {
    Object.assign(manifest, JSON.parse(contents));
  }

  // Set version
  manifest.version = appVersion;

  // Write manifest to target
  await fsp.writeFile(target, JSON.stringify(manifest, null, 4));
}

async function wrapJs(filename) {
  const js = await fsp.readFile(filename, 'utf-8');
  return `(function() {${js}}());`;
}

async function createCommonResources(outdir) {
  await fsp.mkdir(outdir, { recursive: true });
  await fsp.cp('images/icons/', `${outdir}/icons`, { recursive: true });
  await fsp.cp('options/', `${outdir}/options`, { recursive: true });
  await fsp.cp('yahe.css', `${outdir}/yahe.css`, { recursive: true });
  await fsp.writeFile(`${outdir}/yahe.js`, await wrapJs('yahe.js'));
  await fsp.writeFile(`${outdir}/yahe-bg.js`, await wrapJs('yahe-bg.js'));
}

async function zipDirectory(directory, filename) {
  const archive = archiver('zip', {
    zlip: { level: 9 },
  });
  archive.pipe(fs.createWriteStream(filename));
  archive.directory(`${directory}/`, false);
  await archive.finalize();
}

function zipFilename(config) {
  return `yahe.${config.name}.zip`;
}

async function sha256sumForFile(filename) {
  const sum = crypto.createHash('sha256');
  const contents = await fsp.readFile(filename);
  sum.update(contents);
  return sum.digest('hex');
}

async function buildExtensionPackage(config) {
  const outputDir = `${OUTPUTDIR}/${config.name}`;
  const outputZipFile = zipFilename(config);
  const outputZipPath = `${OUTPUTDIR}/${outputZipFile}`;

  await createCommonResources(outputDir);
  await buildManifest(
    `${outputDir}/manifest.json`,
    ['manifest.json'].concat(config.extraManifests),
  );
  await zipDirectory(outputDir, outputZipPath);
  const hash = await sha256sumForFile(outputZipPath);

  return [outputZipFile, hash];
}

async function writeSha256File(files) {
  const contents = files
    .map(([filename, hash]) => `${hash} ${filename}`)
    .join('\n');
  return fsp.writeFile(`${OUTPUTDIR}/sha256sums.txt`, contents);
}

async function main() {
  const output = await Promise.all(buildConfigs.map(buildExtensionPackage));
  await writeSha256File(output);
  await fsp.writeFile(`${OUTPUTDIR}/version.txt`, appVersion);
}

main();
