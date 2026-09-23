"use strict";

const http = require("node:http");
const sea = require("node:sea");
const { exec } = require("node:child_process");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function resolveAssetKey(rawUrl) {
  let pathname = decodeURIComponent((rawUrl || "/").split("?")[0]);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  return pathname.replace(/^\/+/, "");
}

function readAsset(key) {
  try {
    return Buffer.from(sea.getAsset(key));
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  const key = resolveAssetKey(req.url);
  let servedKey = key;
  let body = readAsset(servedKey);

  if (!body && !key.includes(".")) {
    servedKey = `${key.replace(/\/$/, "")}/index.html`;
    body = readAsset(servedKey);
  }

  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = servedKey.slice(servedKey.lastIndexOf("."));
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  res.end(body);
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://localhost:${port}`;
  console.log("엑셀 통합 정리 서비스가 실행 중입니다.");
  console.log(`브라우저가 자동으로 열리지 않으면 이 주소를 직접 열어주세요: ${url}`);
  console.log("이 창을 닫으면 서비스가 종료됩니다.");
  exec(`start "" "${url}"`);
});
