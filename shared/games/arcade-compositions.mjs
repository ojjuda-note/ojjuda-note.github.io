// Decode only the selected instrument recording. The offline sample rate limits
// decoded memory on phones while Web Audio keeps the two ends sample-aligned.
export async function renderLoop(game, signal) {
  if (!/^[a-z_]+$/.test(game)) throw new Error('Unknown soundtrack');
  const response = await fetch('/shared/games/soundtracks/' + game + '.mp3?v=20261127-ensemble1', {signal});
  if (!response.ok) throw new Error('Soundtrack unavailable');
  const encoded = await response.arrayBuffer();
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const decoder = new Offline(2, 1, 32000);
  const buffer = await decoder.decodeAudioData(encoded);
  return {buffer, loopEnd: buffer.duration};
}
