import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const remoteDir = "/opt/ittop-buffet-bot";

const host = process.env.DEPLOY_HOST;
const username = process.env.DEPLOY_USER || "root";
const password = process.env.DEPLOY_PASS;

if (!host || !password) {
  console.error("Need DEPLOY_HOST and DEPLOY_PASS");
  process.exit(1);
}

const envContent = fs.readFileSync(path.join(root, ".env"), "utf8");

const uploadPaths = [
  "package.json",
  "package-lock.json",
  "ecosystem.config.cjs",
  "Dockerfile",
  "railway.toml",
  "src",
  "assets",
  "scripts/setup-server.sh",
  "data/.gitkeep",
];

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", (d) => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on("data", (d) => {
        errOut += d;
        process.stderr.write(d);
      });
      stream.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed (${code}): ${command}\n${errOut}`));
        } else {
          resolve(out);
        }
      });
    });
  });
}

function collectFiles(localPath, remotePath, list = []) {
  const full = path.join(root, localPath);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full)) {
      if (name === "node_modules" || name === ".git") continue;
      collectFiles(path.join(localPath, name), `${remotePath}/${name}`, list);
    }
  } else {
    list.push({ local: full, remote: remotePath });
  }
  return list;
}

function uploadFile(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()));
  });
}

function mkdirp(sftp, dir) {
  return new Promise((resolve) => {
    sftp.mkdir(dir, () => resolve());
  });
}

async function ensureRemoteDirs(sftp, files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.remote.split("/").slice(0, -1);
    let cur = "";
    for (const p of parts) {
      if (!p) continue;
      cur += `/${p}`;
      dirs.add(cur);
    }
  }
  const sorted = [...dirs].sort((a, b) => a.length - b.length);
  for (const d of sorted) await mkdirp(sftp, d);
}

async function main() {
  const files = [];
  for (const p of uploadPaths) {
    const full = path.join(root, p);
    if (!fs.existsSync(full)) continue;
    collectFiles(p, `${remoteDir}/${p.replace(/\\/g, "/")}`, files);
  }

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({ host, port: 22, username, password, readyTimeout: 30000 });
  });

  console.log("Connected. Preparing directory...");
  await exec(conn, `mkdir -p ${remoteDir}/data ${remoteDir}/scripts ${remoteDir}/src ${remoteDir}/assets/menu`);

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  await ensureRemoteDirs(sftp, files);
  console.log(`Uploading ${files.length} files...`);
  for (const f of files) {
    await uploadFile(sftp, f.local, f.remote);
    console.log("  ", f.remote);
  }

  await new Promise((resolve, reject) => {
    sftp.writeFile(`${remoteDir}/.env`, envContent, (err) =>
      err ? reject(err) : resolve(),
    );
  });
  console.log("  .env written");

  console.log("Installing deps and starting PM2...");
  await exec(
    conn,
    [
      `cd ${remoteDir}`,
      `npm ci --omit=dev`,
      `pm2 delete ittop-buffet-bot >/dev/null 2>&1 || true`,
      `pm2 start ecosystem.config.cjs`,
      `pm2 save`,
      `pm2 status`,
    ].join(" && "),
  );

  conn.end();
  console.log("DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
