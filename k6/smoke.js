import http from "k6/http";
import { check, sleep } from "k6";

const configuredBaseUrl = __ENV.BASE_URL || "http://127.0.0.1:3100";
const baseUrl = configuredBaseUrl.replace(/\/$/, "");

export const options = {
  scenarios: {
    health_smoke: {
      executor: "shared-iterations",
      iterations: 3,
      maxDuration: "15s",
      vus: 1,
    },
  },
  thresholds: {
    checks: ["rate==1"],
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate==0"],
  },
};

export default function healthSmoke() {
  const response = http.get(`${baseUrl}/api/health`, {
    headers: { Accept: "application/json" },
    tags: { endpoint: "health" },
    timeout: "5s",
  });

  let payload;
  try {
    payload = response.json();
  } catch {
    payload = undefined;
  }

  check(response, {
    "health returns HTTP 200": (result) => result.status === 200,
    "health returns JSON": (result) =>
      String(result.headers["Content-Type"] || "").includes("application/json"),
    "health reports ready status": () =>
      payload?.status === "ok" || payload?.ok === true || payload?.status === "healthy",
    "health identifies a runtime": () =>
      typeof payload?.runtime === "string" ||
      (typeof payload?.runtime === "object" && payload?.runtime !== null),
    "health identifies a build version": () =>
      typeof payload?.version === "string" ||
      typeof payload?.buildVersion === "string" ||
      typeof payload?.build?.version === "string",
  });

  sleep(0.25);
}
