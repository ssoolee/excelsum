"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "out");
const DIST_DIR = path.join(ROOT, "dist-offline");
const SEA_CONFIG_PATH = path.join(ROOT, "sea-config.json");
const SEA_BLOB_PATH = path.join(ROOT, "sea-prep.blob");
const SERVER_ENTRY = path.join(ROOT, "scripts", "offline-server.js");
const EXE_NAME = "excelsum-offline.exe";
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function toPosixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function run(commandLine) {
  console.log(`\n$ ${commandLine}`);
  execSync(commandLine, { stdio: "inherit", cwd: ROOT });
}

function collectAssets(dir, outDir, rootDir, assets) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAssets(fullPath, outDir, rootDir, assets);
    } else if (entry.isFile()) {
      const key = toPosixRelative(outDir, fullPath);
      assets[key] = toPosixRelative(rootDir, fullPath);
    }
  }
  return assets;
}

function main() {
  console.log("1/6 정적 사이트 빌드 (npm run build)...");
  run("npm run build");

  if (!fs.existsSync(OUT_DIR)) {
    throw new Error(`빌드 결과 폴더를 찾을 수 없습니다: ${OUT_DIR}`);
  }

  console.log("2/6 정적 파일 목록 수집...");
  const assets = collectAssets(OUT_DIR, OUT_DIR, ROOT, {});
  console.log(`   -> ${Object.keys(assets).length}개 파일`);

  console.log("3/6 sea-config.json 생성...");
  const seaConfig = {
    main: toPosixRelative(ROOT, SERVER_ENTRY),
    output: toPosixRelative(ROOT, SEA_BLOB_PATH),
    disableExperimentalSEAWarning: true,
    assets,
  };
  fs.writeFileSync(SEA_CONFIG_PATH, JSON.stringify(seaConfig, null, 2));

  console.log("4/6 SEA 블롭 생성...");
  run(`"${process.execPath}" --experimental-sea-config "${SEA_CONFIG_PATH}"`);

  console.log("5/6 node 실행파일 복사...");
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const exePath = path.join(DIST_DIR, EXE_NAME);
  fs.copyFileSync(process.execPath, exePath);

  console.log("6/6 postject로 블롭 주입...");
  run(
    `npx -y postject "${exePath}" NODE_SEA_BLOB "${SEA_BLOB_PATH}" --sentinel-fuse ${SEA_FUSE}`
  );

  console.log(`\n완료: ${exePath}`);
  console.log("이 파일 하나만 옮기면 오프라인 PC에서도 실행할 수 있습니다.");
}

main();
