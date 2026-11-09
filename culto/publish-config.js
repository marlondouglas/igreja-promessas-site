"use strict";
/* URL and WHIP helpers shared by the studio and its offline tests. No secrets. */
((root, factory) => {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  else root.PromessasPublisherConfig = helpers;
})(typeof globalThis === "object" ? globalThis : this, () => {
  function isLoopback(hostname) {
    return ["localhost", "127.0.0.1", "[::1]"].includes(String(hostname).toLowerCase());
  }
  function validateEndpoint(value, mode = "remote") {
    try {
      const url = new URL(String(value).trim());
      if (url.username || url.password || url.search || url.hash) return null;
      if (mode === "remote" && isLoopback(url.hostname)) return null;
      if (url.protocol !== "https:" && !(mode === "local" && url.protocol === "http:" && isLoopback(url.hostname))) return null;
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (!url.pathname.endsWith("/culto/whip")) return null;
      return url.toString();
    } catch (_) { return null; }
  }
  function sessionURL(value, endpoint) {
    if (!value) return null;
    try {
      const base = new URL(endpoint), url = new URL(value, base);
      if (url.origin !== base.origin || url.username || url.password || url.search || url.hash) return null;
      if (!url.pathname.startsWith(base.pathname + "/") || url.pathname === base.pathname + "/") return null;
      return url.toString();
    } catch (_) { return null; }
  }
  // Split HTTP lists only outside quoted strings and URI angle brackets.
  function split(value, separator) {
    const parts = [];
    let start = 0, quoted = false, escaped = false, angle = false;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (escaped) { escaped = false; continue; }
      if (quoted && c === "\\") { escaped = true; continue; }
      if (c === '"') quoted = !quoted;
      if (!quoted && c === "<") angle = true;
      if (!quoted && c === ">") angle = false;
      if (!quoted && !angle && c === separator) { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
    if (!quoted && !angle) parts.push(value.slice(start).trim());
    return parts;
  }
  function parseIceServers(header) {
    const servers = [];
    for (const entry of split(String(header || "").slice(0, 32768), ",")) {
      const match = /^<([^<>]+)>\s*(.*)$/.exec(entry);
      if (!match || !/^(stun|stuns|turn|turns):[^\s<>"@]+$/i.test(match[1])) continue;
      const attrs = {};
      for (const part of split(match[2], ";")) {
        const attr = /^([\w-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s;]+))$/.exec(part);
        if (attr) attrs[attr[1].toLowerCase()] = attr[2] === undefined ? attr[3] : attr[2].replace(/\\(.)/g, "$1");
      }
      if (!String(attrs.rel || "").split(/\s+/).includes("ice-server")) continue;
      if (attrs["credential-type"] && attrs["credential-type"] !== "password") continue;
      const server = { urls: [match[1]] };
      if (/^turns?:/i.test(match[1])) {
        if (!attrs.username || !attrs.credential) continue;
        server.username = attrs.username; server.credential = attrs.credential; server.credentialType = "password";
      }
      servers.push(server);
      if (servers.length === 16) break;
    }
    return servers;
  }
  return { isLoopback, validateEndpoint, sessionURL, parseIceServers };
});
