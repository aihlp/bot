const workerUrl = process.env.WORKER_URL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!workerUrl) {
  throw new Error("WORKER_URL is required");
}

const basic = `Basic ${Buffer.from(`admin:${adminPassword ?? ""}`).toString("base64")}`;

async function check(label, url, expectedStatus, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${label} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 300)}`);
  }
  console.log(`${label}: ${response.status}`);
}

await check("root", `${workerUrl.replace(/\/$/, "")}/`, 302);
await check("health", `${workerUrl.replace(/\/$/, "")}/health`, 200);
await check("admin auth challenge", `${workerUrl.replace(/\/$/, "")}/admin`, 401);
await check("admin html", `${workerUrl.replace(/\/$/, "")}/admin`, 200, {
  headers: { Authorization: basic }
});
await check("api auth challenge", `${workerUrl.replace(/\/$/, "")}/api/bots`, 401);
