// Both expressions are loaded together so the first paid reaction never flashes blank.
const portraitURL=expression=>new URL(`./assets/matgo-opponent/${expression}-v1.png`,import.meta.url).href;
export function cpuPortraitHTML(){
  return `<span class="cpu-portrait" role="img" aria-label="컴퓨터 상대 캐릭터"><img class="cpu-face-normal" src="${portraitURL('normal')}" width="1254" height="1254" alt="" draggable="false" decoding="sync"><img class="cpu-face-surprised" src="${portraitURL('surprised')}" width="1254" height="1254" alt="" draggable="false" decoding="sync"></span>`;
}
