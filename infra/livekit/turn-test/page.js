/* global document, LivekitClient */
// Browser side of turn-test.mjs, loaded after livekit-client (UMD build). Exposes
// `globalThis.turnTest`.
(() => {
  const iceLog = [];
  const NativePeerConnection = globalThis.RTCPeerConnection;
  // Records the ICE servers LiveKit hands out and every candidate or candidate error.
  function LoggingPeerConnection(config, ...rest) {
    iceLog.push({ iceServers: config?.iceServers, policy: config?.iceTransportPolicy });
    const pc = new NativePeerConnection(config, ...rest);
    pc.addEventListener('icecandidateerror', (event) => {
      iceLog.push({ error: event.errorCode, text: event.errorText, url: event.url });
    });
    pc.addEventListener('icecandidate', (event) => {
      iceLog.push({ candidate: event.candidate?.candidate });
    });
    return pc;
  }
  LoggingPeerConnection.prototype = NativePeerConnection.prototype;
  globalThis.RTCPeerConnection = LoggingPeerConnection;

  let room;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  globalThis.turnTest = {
    iceLog: () => iceLog,

    /** Joins with ICE restricted to relays (TURN), like a network where only TURN works. */
    async connect({ url, token }) {
      room = new LivekitClient.Room();
      await room.connect(url, token, { rtcConfig: { iceTransportPolicy: 'relay' } });
    },

    publishCamera: () => room.localParticipant.setCameraEnabled(true),

    /** Waits for the first remote video with frames and reports the selected ICE candidate. */
    async receiveVideo(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      let track;
      while (Date.now() < deadline && track === undefined) {
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.videoTrack !== undefined) track = publication.videoTrack;
          }
        }
        if (track === undefined) await sleep(200);
      }
      if (track === undefined) return { ok: false, reason: 'no video track subscribed' };
      const video = document.createElement('video');
      video.muted = true;
      document.body.append(video);
      track.attach(video);
      while (Date.now() < deadline && video.videoWidth === 0) await sleep(200);

      const report = await track.getRTCStatsReport();
      const stats = report === undefined ? [] : [...report.values()];
      const transport = stats.find((s) => s.type === 'transport' && s.selectedCandidatePairId);
      const pair =
        stats.find((s) => s.id === transport?.selectedCandidatePairId) ??
        stats.find((s) => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded');
      const local = stats.find((s) => s.id === pair?.localCandidateId);
      return {
        ok: video.videoWidth > 0,
        videoWidth: video.videoWidth,
        candidateType: local?.candidateType,
        relayProtocol: local?.relayProtocol,
        url: local?.url,
      };
    },
  };
})();
