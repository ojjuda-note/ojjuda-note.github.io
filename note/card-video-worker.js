import { prepareCardVideoData } from './card-video.js?v=20261120-video1';

self.onmessage = async ({ data }) => {
  self.postMessage({ type: 'started' });
  try {
    const result = await prepareCardVideoData(data.file, {
      onProgress: event => self.postMessage({ type: 'progress', ...event }),
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', code: error.code || 'invalid_video', message: error.message });
  }
};
