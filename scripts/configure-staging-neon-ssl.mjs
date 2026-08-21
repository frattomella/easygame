import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const expectedProject = "easygame-staging";
const allowValue = process.env.EASYGAME_ALLOW_STAGING_SSL_UPDATE;
const project = JSON.parse(
  readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"),
);

if (project.projectName !== expectedProject || allowValue !== expectedProject) {
  throw new Error(
    "Refusing to update SSL outside the EasyGame staging project",
  );
}

const vercelCommand = process.platform === "win32" ? "vercel.cmd" : "vercel";

for (const variableName of ["DATABASE_URL", "DIRECT_URL"]) {
  const currentUrl = process.env[variableName];
  if (!currentUrl) {
    throw new Error(`${variableName} is not configured`);
  }

  const url = new URL(currentUrl);
  url.searchParams.set("sslmode", "verify-full");

  const result = spawnSync(
    vercelCommand,
    ["env", "add", variableName, "production", "--force"],
    {
      cwd: new URL("..", import.meta.url),
      input: `${url.toString()}\n`,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Unable to update ${variableName}: ${result.stderr || result.stdout}`,
    );
  }

  console.log(`${variableName}: configured with sslmode=verify-full`);
}
