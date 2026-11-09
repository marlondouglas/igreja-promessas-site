"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEndpoint, sessionURL, parseIceServers } = require("../culto/publish-config.js");

test("remote publishing requires HTTPS and cannot target the other notebook's loopback", () => {
  for (const input of ["http://example.test/culto/whip", "http://192.168.0.2/culto/whip", "https://127.0.0.1/culto/whip", "https://localhost/culto/whip", "https://[::1]/culto/whip"]) {
    assert.equal(validateEndpoint(input, "remote"), null);
  }
  assert.equal(validateEndpoint("https://ingest.example.test/culto/whip", "remote"), "https://ingest.example.test/culto/whip");
  assert.equal(validateEndpoint("https://ingest.example.test/entrada/culto/whip/", "remote"), "https://ingest.example.test/entrada/culto/whip");
});
test("local publishing remains available without allowing HTTP on arbitrary hosts", () => {
  assert.equal(validateEndpoint("http://127.0.0.1:8889/culto/whip", "local"), "http://127.0.0.1:8889/culto/whip");
  assert.equal(validateEndpoint("http://[::1]:8889/culto/whip", "local"), "http://[::1]:8889/culto/whip");
  assert.equal(validateEndpoint("http://server.test/culto/whip", "local"), null);
});
test("endpoint input does not accept embedded credentials, query keys or viewer addresses", () => {
  for (const input of ["https://user:pass@example.test/culto/whip", "https://example.test/culto/whip?token=secret", "https://example.test/culto/whip#secret", "https://example.test/culto", "javascript:alert(1)", "/culto/whip"]) {
    assert.equal(validateEndpoint(input), null);
  }
});
test("WHIP cleanup never sends authorization to another host or outside its session scope", () => {
  const endpoint = "https://ingest.example.test/entrada/culto/whip";
  assert.equal(sessionURL("/entrada/culto/whip/session-123", endpoint), endpoint + "/session-123");
  assert.equal(sessionURL("whip/session-123", endpoint), endpoint + "/session-123");
  for (const location of [null, "https://other.test/entrada/culto/whip/id", "http://ingest.example.test/entrada/culto/whip/id", "/admin/delete", "../whip/../../delete", "/entrada/culto/whip/", "/entrada/culto/whip/id?secret=yes", "https://user:pass@ingest.example.test/entrada/culto/whip/id"]) {
    assert.equal(sessionURL(location, endpoint), null);
  }
});
test("standard WHIP Link headers provide STUN and temporary TURN credentials", () => {
  const header = '<stun:stun.example.test:3478>; rel="ice-server", <turns:relay.example.test:5349?transport=tcp>; rel="ice-server"; username="expires:operator"; credential="temporary-token"; credential-type="password"';
  assert.deepEqual(parseIceServers(header), [
    { urls: ["stun:stun.example.test:3478"] },
    { urls: ["turns:relay.example.test:5349?transport=tcp"], username: "expires:operator", credential: "temporary-token", credentialType: "password" }
  ]);
});
test("Link parser handles quoted delimiters and rejects non-ICE or incomplete TURN links", () => {
  assert.deepEqual(parseIceServers('<turn:relay.example.test>; rel="ice-server"; username="user,one"; credential="pass;with\\\"quote"'), [
    { urls: ["turn:relay.example.test"], username: "user,one", credential: 'pass;with"quote', credentialType: "password" }
  ]);
  for (const header of [null, '<https://example.test/secret>; rel="ice-server"', '<turn:relay.test>; rel="ice-server"', '<stun:relay.test>; rel="unrelated"', '<turn:relay.test>; rel="ice-server"; username="x"; credential="y"; credential-type="token"']) {
    assert.deepEqual(parseIceServers(header), []);
  }
});
