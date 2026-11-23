import { mkdir, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic fixtures are recreated locally/CI; no member media or committed
// binaries. FFmpeg is a test dependency, never a browser/runtime dependency.
export async function generateParkVideoFixtures(directory) {
  const dir = directory || await mkdtemp(join(tmpdir(), 'park-video-validation-'));
  await mkdir(dir, { recursive: true });
  const run = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args, '-y'], { stdio: 'pipe' });
  const base = (name, { seconds = 1.25, rate = 24, size = '320x180', audio = true, copies = 1 } = {}) => {
    const args = ['-f', 'lavfi', '-i', `color=c=blue:s=${size}:r=${rate}:d=${seconds}`];
    if (audio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
    for (let i = 0; i < copies; i++) args.push('-map', '0:v');
    if (audio) args.push('-map', '1:a');
    args.push('-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline');
    if (audio) args.push('-c:a', 'aac');
    args.push('-movflags', '+faststart', join(dir, name)); run(args);
  };
  base('valid.mp4');
  base('sixty-seconds.mp4', { seconds: 60, rate: 1, audio: false });
  base('sixty-fps.mp4', { seconds: 1, rate: 60, audio: false });
  base('two-video-tracks.mp4', { audio: false, copies: 2 });
  base('hd.mp4', { seconds: 0.25, size: '1920x1080', audio: false });
  run(['-i', join(dir, 'valid.mp4'), '-frames:v', '1', '-update', '1', join(dir, 'poster.jpg')]);
  run(['-display_rotation:v:0', '90', '-i', join(dir, 'valid.mp4'), '-c', 'copy', '-movflags', '+faststart', join(dir, 'portrait.mp4')]);
  run(['-i', join(dir, 'portrait.mp4'), '-frames:v', '1', '-update', '1', join(dir, 'portrait.jpg')]);
  return dir;
}
