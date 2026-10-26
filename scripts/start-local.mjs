import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function run(args) {
  return new Promise((resolve, reject) => {
    const child = process.platform === "win32" ? spawn("cmd.exe", ["/d", "/s", "/c", "pnpm " + args.join(" ")], { cwd, stdio: "inherit", windowsHide: true }) : spawn("pnpm", args, { cwd, stdio: "inherit" });
    child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("pnpm exited with " + code)));
  });
}
await run(["install", "--frozen-lockfile", "--ignore-scripts"]);
await run(["dev"]);
