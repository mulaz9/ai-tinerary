import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const webIcons = path.resolve(root, "../../public/icons");
const resources = path.join(root, "resources");

await mkdir(resources, { recursive: true });
await copyFile(path.join(webIcons, "icon-512.png"), path.join(resources, "icon.png"));
await copyFile(path.join(webIcons, "icon-512.png"), path.join(resources, "splash.png"));
console.log("Copied icons from public/icons/ to resources/");
