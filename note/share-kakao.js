/* Kakao receives only the public card image already prepared by share-image.js. */
(() => {
  'use strict';
  const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
  const SDK_SRI = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';
  const MAX_BYTES = 5_000_000;
  let sdkPromise = null;
  const error = code => new Error(code);
  const abort = () => new DOMException('Share preparation was replaced', 'AbortError');
  function configuredKey() {
    const value = window.OJJUDA_CONFIG?.kakaoJavaScriptKey;
    const key = typeof value === 'string' ? value.trim() : '';
    return /^[a-f0-9]{32}$/i.test(key) ? key : '';
  }
  function timeout(promise, milliseconds, code) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(error(code)), milliseconds);
      Promise.resolve(promise).then(value => {
        clearTimeout(timer); resolve(value);
      }, reason => { clearTimeout(timer); reject(reason); });
    });
  }
  function loadSDK() {
    if (window.Kakao) return Promise.resolve(window.Kakao);
    if (sdkPromise) return sdkPromise;
    const script = document.createElement('script');
    script.src = SDK_URL; script.integrity = SDK_SRI;
    script.crossOrigin = 'anonymous'; script.async = true;
    sdkPromise = timeout(new Promise((resolve, reject) => {
      script.onload = () => window.Kakao ? resolve(window.Kakao) : reject(error('kakao_sdk_unavailable'));
      script.onerror = () => reject(error('kakao_sdk_unavailable'));
      document.head.append(script);
    }), 12000, 'kakao_sdk_timeout').catch(reason => {
      script.remove(); sdkPromise = null; throw reason;
    }).finally(() => { script.onload = null; script.onerror = null; });
    return sdkPromise;
  }
  function initialize(sdk, key) {
    if (typeof sdk?.init !== 'function' || typeof sdk.isInitialized !== 'function' ||
        typeof sdk.Auth?.getAppKey !== 'function' ||
        ['uploadImage', 'sendDefault', 'deleteImage'].some(name => typeof sdk.Share?.[name] !== 'function'))
      throw error('kakao_sdk_unavailable');
    if (sdk.isInitialized() && sdk.Auth.getAppKey() !== key) throw error('kakao_key_conflict');
    if (!sdk.isInitialized()) sdk.init(key);
    if (!sdk.isInitialized() || sdk.Auth.getAppKey() !== key) throw error('kakao_key_conflict');
  }
  function imageURL(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:') url.protocol = 'https:';
      if (url.protocol !== 'https:' || url.username || url.password) throw error('invalid');
      return url.href;
    } catch { throw error('kakao_image_invalid'); }
  }
  async function uploadFile(file, check) {
    if (!file || Object.prototype.toString.call(file) !== '[object File]' ||
        !/^image\/(png|jpeg)$/.test(file.type) || !file.size) throw error('kakao_image_invalid');
    if (file.size <= MAX_BYTES) return file;
    const url = URL.createObjectURL(file), image = new Image();
    const canvas = document.createElement('canvas');
    try {
      await timeout(new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = () => reject(error('kakao_image_invalid'));
        image.src = url;
      }), 12000, 'kakao_image_timeout');
      check();
      if (!image.naturalWidth || !image.naturalHeight) throw error('kakao_image_invalid');
      const context = canvas.getContext('2d');
      if (!context) throw error('kakao_image_invalid');
      let scale = Math.min(1, 1600 / image.naturalWidth, 1600 / image.naturalHeight);
      for (const quality of [0.88, 0.72, 0.56]) {
        check();
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await timeout(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)),
          8000, 'kakao_image_timeout');
        check();
        if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= MAX_BYTES)
          return new File([blob], 'ojjuda-card.jpg', { type: 'image/jpeg', lastModified: Date.now() });
        scale *= 0.7;
      }
      throw error('kakao_image_too_large');
    } finally {
      image.onload = null; image.onerror = null; image.src = '';
      URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0;
    }
  }
  async function prepare(file, { cardUrl, title = '오쭈다 공원의 카드', isCurrent = () => true } = {}) {
    const key = configuredKey();
    if (!key) throw error('kakao_not_configured'); // No SDK request or upload without a real key format.
    try {
      if (typeof cardUrl !== 'string') throw error('invalid');
      const url = new URL(cardUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw error('invalid');
    } catch { throw error('kakao_card_url_invalid'); }
    let sdk = null, uploadedUrl = '', alive = true, sent = false;
    function remove(url) {
      if (!url || !sdk) return;
      try { Promise.resolve(sdk.Share.deleteImage({ imageUrl: url })).catch(() => {}); } catch {}
    }
    function dispose() {
      alive = false;
      if (!sent && uploadedUrl) {
        const url = uploadedUrl; uploadedUrl = ''; remove(url);
      }
    }
    function check() {
      if (!alive || !isCurrent()) { dispose(); throw abort(); }
      if (configuredKey() !== key) { dispose(); throw error('kakao_key_conflict'); }
    }
    try {
      check();
      const preparedFile = await uploadFile(file, check);
      check();
      sdk = await loadSDK();
      check(); initialize(sdk, key); check();
      if (preparedFile.size > MAX_BYTES) throw error('kakao_image_too_large');
      const transfer = new DataTransfer();
      transfer.items.add(preparedFile);
      // Keep this continuation attached after timeout so late uploads are still removed.
      const uploading = Promise.resolve(sdk.Share.uploadImage({ file: transfer.files })).then(response => {
        const image = response?.infos?.original;
        uploadedUrl = imageURL(image?.url);
        check();
        return image;
      });
      const image = await timeout(uploading, 15000, 'kakao_upload_timeout');
      check();
      const link = { mobileWebUrl: cardUrl, webUrl: cardUrl };
      const content = {
        title: String(title || '오쭈다 공원의 카드'),
        description: '오쭈다 아지트 · ojjuda.com', imageUrl: uploadedUrl, link
      };
      if (Number.isFinite(image.width) && image.width > 0) content.imageWidth = image.width;
      if (Number.isFinite(image.height) && image.height > 0) content.imageHeight = image.height;
      const payload = { objectType: 'feed', content, buttons: [{ title: '카드 보기', link }] };
      return Object.freeze({
        send() {
          check();
          if (sent) return;
          initialize(sdk, key);
          // No awaits here: the final button click must reach the SDK synchronously.
          sent = true;
          try { sdk.Share.sendDefault(payload); }
          catch (reason) { sent = false; throw reason; }
        },
        dispose
      });
    } catch (reason) { dispose(); throw reason; }
  }
  window.OjjudaKakaoShare = Object.freeze({ isConfigured: () => !!configuredKey(), prepare });
})();
