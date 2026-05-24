import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const tarball = `../${packageJson.name}-${packageJson.version}.tgz`;
const previewPackagePath = resolve(root, "preview-consumer", "package.json");
const previewPackage = JSON.parse(await readFile(previewPackagePath, "utf8"));

previewPackage.dependencies = {
  ...previewPackage.dependencies,
  [packageJson.name]: `file:${tarball}`
};

await writeFile(previewPackagePath, `${JSON.stringify(previewPackage, null, 2)}\n`);
console.log(`preview-consumer now depends on ${packageJson.name}@file:${tarball}`);
