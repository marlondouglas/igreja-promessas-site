"""Offline browser regression tests: all requests are fulfilled locally; no live server."""
import json
import mimetypes
from pathlib import Path
import unittest
from urllib.parse import urlsplit, unquote

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SECRET = "test-only-password-1234567890"
ENDPOINT = "https://studio.example/ingest/culto/whip"
MOCK_WEBRTC = r"""
window.__peers = [];
window.__audioContext = new AudioContext();
window.PromessasAudioStream = window.__audioContext.createMediaStreamDestination().stream;
window.RTCRtpSender = { getCapabilities: () => ({codecs:[{mimeType:'video/H264',clockRate:90000}]}) };
window.RTCPeerConnection = class extends EventTarget {
  constructor(config) { super(); this.config=config;this.senders=[];this.iceGatheringState='complete';this.connectionState='new'; window.__peers.push(this); }
  addTrack(track) { this.senders.push({track,getParameters:()=>({encodings:[{}]}),setParameters:async()=>{}}); }
  getSenders(){return this.senders;}
  getTransceivers(){return this.senders.map(sender=>({sender,setCodecPreferences:codecs=>{this.preferredCodecs=codecs;}}));}
  async createOffer(){return {type:'offer',sdp:'v=0\r\nmock-offer'};}
  async setLocalDescription(value){this.localDescription=value;}
  async setRemoteDescription(value){this.remoteDescription=value;this.connectionState='connected';this.dispatchEvent(new Event('connectionstatechange'));}
  close(){this.connectionState='closed';this.dispatchEvent(new Event('connectionstatechange'));}
};
"""


class StudioBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.page = self.context.new_page()
        self.errors = []
        self.console = []
        self.requests = []
        self.options_status = 204
        self.location = "/ingest/culto/whip/session-1"
        self.real_studio = False
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.on("console", lambda message: self.console.append(message.text))
        self.context.add_init_script(MOCK_WEBRTC)
        self.context.route("**/*", self.route)

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.assertFalse(any(SECRET in message for message in self.console))
        self.context.close()

    def route(self, route):
        request = route.request
        url = urlsplit(request.url)
        self.requests.append((request.method, request.url, request.headers))
        if url.path.startswith("/ingest/"):
            headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Location, Link"}
            if request.method == "OPTIONS":
                headers["Link"] = '<turns:relay.example:5349?transport=tcp>; rel="ice-server"; username="temporary"; credential="ephemeral"; credential-type="password"'
                route.fulfill(status=self.options_status, headers=headers)
            elif request.method == "POST":
                headers["Location"] = self.location
                route.fulfill(status=201, headers=headers, content_type="application/sdp", body="v=0\r\nmock-answer")
            elif request.method == "DELETE":
                route.fulfill(status=200, headers=headers, body="")
            else:
                route.fulfill(status=405, body="")
            return
        if url.hostname not in ("studio.example", "127.0.0.1"):
            route.fulfill(status=404, body="")
            return
        if url.path == "/culto/studio.js" and not self.real_studio:
            route.fulfill(status=200, content_type="application/javascript", body="/* production UI is isolated for signaling tests */")
            return
        # Media bytes are irrelevant to the signaling and static layout checks.
        if url.path.endswith((".mp4", ".mp3")):
            route.fulfill(status=204, body="")
            return
        path = ROOT / unquote(url.path).lstrip("/")
        if not path.is_file() or ROOT not in path.resolve().parents:
            route.fulfill(status=404, body="")
            return
        route.fulfill(status=200, content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream", body=path.read_bytes())

    def open(self, origin="https://studio.example"):
        self.page.goto(origin + "/culto/studio.html", wait_until="networkidle")

    def prepare_remote(self):
        self.page.locator("#whip-url").fill(ENDPOINT)
        self.page.locator("#publish-secret").fill(SECRET)

    def start(self):
        self.page.locator("#publish-enabled").check()
        self.page.evaluate("document.getElementById('scene-status').textContent='ABERTURA';window.dispatchEvent(new CustomEvent('promessas-scene',{detail:{phase:'intro'}}))")

    def publishing_requests(self, method=None):
        return [r for r in self.requests if "/ingest/" in r[1] and (method is None or r[0] == method)]

    def test_public_default_remote_and_localhost_default(self):
        self.open()
        expect(self.page.locator("#publish-location")).to_have_value("remote")
        expect(self.page.locator("#whip-url")).to_have_value("")
        expect(self.page.locator("#local-signal-link")).to_be_hidden()
        self.assertEqual(self.publishing_requests(), [])
        self.open("http://127.0.0.1:8080")
        expect(self.page.locator("#publish-location")).to_have_value("local")
        expect(self.page.locator("#whip-url")).to_have_value("http://127.0.0.1:8889/culto/whip")
        expect(self.page.locator("#local-signal-link")).to_be_visible()

    def test_remote_http_and_loopback_are_rejected_without_network(self):
        self.open()
        for endpoint in ("http://server.example/culto/whip", "https://127.0.0.1/culto/whip", "http://127.0.0.1:8889/culto/whip"):
            self.page.locator("#whip-url").fill(endpoint)
            self.page.locator("#publish-secret").fill(SECRET)
            self.page.locator("#test-server").click()
            expect(self.page.locator("#publish-status")).to_contain_text("Não use localhost")
        self.assertEqual(self.publishing_requests(), [])

    def test_probe_404_is_not_success(self):
        self.options_status = 404
        self.open()
        self.prepare_remote()
        self.page.locator("#test-server").click()
        expect(self.page.locator("#publish-status")).to_contain_text("HTTP 404")
        expect(self.page.locator("#server-badge")).to_have_text("SEM CONEXÃO")
        self.assertEqual(self.publishing_requests("POST"), [])

    def test_probe_turn_is_read_only_and_does_not_claim_public_stream(self):
        self.open()
        self.prepare_remote()
        self.page.locator("#test-server").click()
        expect(self.page.locator("#publish-status")).to_contain_text("TURN")
        expect(self.page.locator("#publish-status")).to_contain_text("não confirma a senha")
        self.assertEqual(len(self.publishing_requests("OPTIONS")), 1)
        self.assertEqual(self.publishing_requests("POST"), [])
        self.assertEqual(self.page.evaluate("window.__peers.length"), 0)

    def test_live_handshake_stop_and_credentials_not_persisted(self):
        self.open()
        self.prepare_remote()
        self.start()
        expect(self.page.locator("#server-badge")).to_have_text("SINAL CONECTADO")
        expect(self.page.locator("#publish-status")).to_contain_text("Confirme imagem e áudio")
        self.assertEqual(len(self.publishing_requests("POST")), 1)
        self.assertEqual(self.page.evaluate("window.__peers[0].config.iceServers[0].urls[0]"), "turns:relay.example:5349?transport=tcp")
        self.assertEqual(self.page.evaluate("window.__peers[0].preferredCodecs[0].mimeType"), "video/H264")
        self.assertEqual(self.page.evaluate("[localStorage.length,sessionStorage.length]"), [0, 0])
        self.page.locator("#publish-enabled").uncheck()
        expect(self.page.locator("#server-badge")).to_have_text("ENVIO ENCERRADO")
        self.page.wait_for_function("window.__peers[0].connectionState==='closed'")
        self.assertEqual(len(self.publishing_requests("DELETE")), 1)
        self.assertEqual(self.page.evaluate("window.PromessasAudioStream.getAudioTracks()[0].readyState"), "live")
        self.assertTrue(all(SECRET not in url for _, url, _ in self.requests))

    def test_untrusted_location_never_receives_delete_or_credentials(self):
        self.location = "https://untrusted.example/ingest/culto/whip/stolen"
        self.open()
        self.prepare_remote()
        self.start()
        expect(self.page.locator("#server-badge")).to_have_text("FALHA NO ENVIO")
        expect(self.page.locator("#publish-status")).to_contain_text("Location")
        self.assertEqual(self.publishing_requests("DELETE"), [])
        self.assertFalse(any("untrusted.example" in url for _, url, _ in self.requests))
        self.assertEqual(self.page.evaluate("window.__peers[0].connectionState"), "closed")

    def test_disconnected_can_reconnect(self):
        self.open()
        self.prepare_remote()
        self.start()
        expect(self.page.locator("#server-badge")).to_have_text("SINAL CONECTADO")
        self.page.evaluate("window.__peers[0].connectionState='disconnected';window.__peers[0].dispatchEvent(new Event('connectionstatechange'))")
        expect(self.page.locator("#server-badge")).to_have_text("CONEXÃO INTERROMPIDA")
        self.page.locator("#reconnect-publish").click()
        expect(self.page.locator("#server-badge")).to_have_text("SINAL CONECTADO")
        self.assertEqual(len(self.publishing_requests("POST")), 2)
        self.assertEqual(self.page.evaluate("window.__peers.length"), 2)

    def test_real_studio_smoke_and_responsive_layout(self):
        self.real_studio = True
        self.open()
        expect(self.page.locator("#program-canvas")).to_be_visible()
        expect(self.page.locator("#publish-location")).to_have_value("remote")
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
        self.assertEqual(self.publishing_requests(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
