#!/usr/bin/env node
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "client");
const index = path.join(output, "index.html");

if (!existsSync(index)) throw new Error(`Missing GitHub Pages build input: ${index}`);

copyFileSync(index, path.join(output, "404.html"));
writeFileSync(path.join(output, ".nojekyll"), "");

console.log("Prepared GitHub Pages build: dist/client");
