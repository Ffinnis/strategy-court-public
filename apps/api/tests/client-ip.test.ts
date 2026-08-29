import { expect, test } from "bun:test";
import { attachClientIp, CANONICAL_CLIENT_IP_HEADER } from "../src/client-ip";

test("sets the direct client address when no proxy chain exists", () => {
  const request = attachClientIp(new Request("http://localhost/api/auth/get-session"), "127.0.0.1");

  expect(request.headers.get(CANONICAL_CLIENT_IP_HEADER)).toBe("127.0.0.1");
});

test("ignores a spoofed forwarded chain without configured proxies", () => {
  const request = attachClientIp(new Request("http://localhost/api/auth/get-session", {
    headers: { "x-forwarded-for": "198.51.100.23" },
  }), "203.0.113.8", []);

  expect(request.headers.get(CANONICAL_CLIENT_IP_HEADER)).toBe("203.0.113.8");
});

test("appends the verified direct peer to a trusted proxy chain", () => {
  const request = attachClientIp(new Request("http://localhost/api/auth/get-session", {
    headers: { "x-forwarded-for": "198.51.100.23" },
  }), "192.0.2.10", ["192.0.2.10"]);

  expect(request.headers.get(CANONICAL_CLIENT_IP_HEADER)).toBe("198.51.100.23, 192.0.2.10");
});

test("clears a client-supplied canonical header without a direct peer", () => {
  const request = attachClientIp(new Request("http://localhost/api/auth/get-session", {
    headers: { [CANONICAL_CLIENT_IP_HEADER]: "203.0.113.42" },
  }), undefined);

  expect(request.headers.get(CANONICAL_CLIENT_IP_HEADER)).toBe("");
});
