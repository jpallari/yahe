const archiver = require('archiver');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs-extra');

const OUTPUTDIR = 'output';
const buildConfigs = [
  {
    name: 'webextension',
    extraManifests: ['manifest.webext.json'],
  },
  {
    name: 'chrome',
    extraManifests: [],
  },
];

const gitVersion = (() => {
  const version = childProcess.execSync(
    "git describe --match 'v[0-9]*' --abbrev=0 HEAD",
    {
      encoding: 'utf-8',
    },
  );
  return version.replace(/^v/, '').replace('\n', '');
})();

async function buildManifest(target, sources) {
  // Read manifest files
  const manifestContents = await Promise.all(
    sources.map((filename) => fs.readFileSync(filename, 'utf-8')),
  );

  // Merge manifests
  const manifest = {};
  manifestContents.forEach((contents) => {
    Object.assign(manifest, JSON.parse(contents));
  });

  // Set version
  manifest.version = gitVersion;

  // Write manifest to target
  await fs.writeFile(target, JSON.stringify(manifest, null, 4));
}

async function wrapJs(filename) {
  const js = await fs.readFile(filename, 'utf-8');
  return `(function() {${js}}());`;
}

async function createCommonResources(outdir) {
  await fs.mkdirp(outdir);
  await fs.copy('images/icons/', `${outdir}/icons`);
  await fs.copy('options/', `${outdir}/options`);
  await fs.copy('yahe.css', `${outdir}/yahe.css`);
  await fs.writeFile(`${outdir}/yahe.js`, await wrapJs('yahe.js'));
  await fs.writeFile(`${outdir}/yahe-bg.js`, await wrapJs('yahe-bg.js'));
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
  const contents = await fs.readFile(filename);
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
  return fs.writeFile(`${OUTPUTDIR}/sha256sums.txt`, contents);
}

async function main() {
  const output = await Promise.all(buildConfigs.map(buildExtensionPackage));
  await writeSha256File(output);
  await fs.writeFile(`${OUTPUTDIR}/version.txt`, gitVersion);
}

main();
