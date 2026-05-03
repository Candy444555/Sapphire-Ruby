import app from "./app";
import { loadAllJsSkills } from "./routes/self-patch";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Hot-load any JS skills Lexi has fused into her source tree.
try {
  const result = loadAllJsSkills();
  console.log(`[Lexi] JS skills loaded: ${result.loaded}${result.failed.length ? `, failed: ${result.failed.length}` : ""}`);
  if (result.failed.length) console.warn("[Lexi] Skill load failures:", result.failed);
} catch (e) {
  console.warn("[Lexi] JS skill registry init failed:", e);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
