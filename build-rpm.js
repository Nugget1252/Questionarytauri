// build-rpm.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pkg = require('./package.json');
const distDir = path.join(__dirname, 'dist');
const unpackedDir = path.join(distDir, 'linux-unpacked');

if (!fs.existsSync(unpackedDir)) {
    console.error('❌ dist/linux-unpacked does not exist. Run "npx electron-builder --linux --dir" first.');
    process.exit(1);
}

const rpmName = `${pkg.name}-${pkg.version}.x86_64.rpm`;
const rpmPath = path.join(distDir, rpmName);

console.log(`📦 Packaging RPM using Fedora native tools: ${rpmName}...`);

// Clean previous rpm if exists
if (fs.existsSync(rpmPath)) {
    fs.unlinkSync(rpmPath);
}

const fpmCmd = [
    'fpm',
'-s dir',
'-t rpm',
'--force',
`--name "${pkg.name}"`,
`--version "${pkg.version}"`,
'--architecture "x86_64"',
`--description "${pkg.description || 'Questionary Desktop App'}"`,
`--maintainer "${pkg.author || 'Questionary'}"`,
'--rpm-compression xz',
'--rpm-auto-add-directories',
'--rpm-rpmbuild-define "_build_id_links none"',
'--rpm-rpmbuild-define "debug_package %{nil}"',
'--rpm-rpmbuild-define "__spec_install_post %{nil}"',
'--rpm-rpmbuild-define "__os_install_post %{nil}"',
`-p "${rpmPath}"`,
`"${unpackedDir}/"=/opt/Questionary`,
`"assets/icons/512x512.png"=/usr/share/icons/hicolor/512x512/apps/questionary.png`,
`"assets/icons/256x256.png"=/usr/share/icons/hicolor/256x256/apps/questionary.png`,
`"assets/icons/128x128.png"=/usr/share/icons/hicolor/128x128/apps/questionary.png`,
`"assets/icons/64x64.png"=/usr/share/icons/hicolor/64x64/apps/questionary.png`,
`"assets/icons/32x32.png"=/usr/share/icons/hicolor/32x32/apps/questionary.png`,
`"assets/icons/16x16.png"=/usr/share/icons/hicolor/16x16/apps/questionary.png`
].join(' ');

try {
    execSync(fpmCmd, { stdio: 'inherit' });
    console.log(`\n🎉 Successfully built native RPM: dist/${rpmName}`);
} catch (err) {
    console.error('\n❌ RPM build failed:', err.message);
    process.exit(1);
}
