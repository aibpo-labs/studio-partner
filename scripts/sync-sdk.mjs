import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [
  [
    "latentx-voice.js",
    "29d22b4614061ede8436da563efe8c84ee77ef47e077e21be1cec0fab5ddc733",
  ],
  [
    "JsSIP-LICENSE.txt",
    "2541fbb7ab0f3b83e6405084d9428cf04dc560165ddd6ff4ea6628abb2e53ca4",
  ],
];
// Downloads only public assets; never reads an API Key or starts a call.
const downloaded = [];
for (const [name, hash] of files) {
  const response = await fetch(`https://api.latenth.com/sdk/${name}`, {
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Cannot download ${name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (hash && actual !== hash)
    throw new Error(
      `${name} changed upstream. Review the new version before updating its hash.`,
    );
  downloaded.push({ name, bytes, sha256: actual });
}
const directory = new URL("../.vendor/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const file of downloaded)
  await writeFile(new URL(file.name, directory), file.bytes);
await writeFile(
  new URL("provenance.json", directory),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      source: "https://api.latenth.com/sdk/",
      files: downloaded.map(({ name, sha256 }) => ({ name, sha256 })),
    },
    null,
    2,
  ),
);
console.log(
  "Public SDK and JsSIP license downloaded. SDK SHA256 verified. No model calls made.",
);
