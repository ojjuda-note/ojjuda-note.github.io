const MN = ['','송학','매조','벚꽃','흑싸리','난초','모란','홍싸리','공산','국화','단풍','오동','비'];
const KN = {gwang:'광',yul:'열끗',tti:'띠',pi:'피',ssang:'쌍피'};
// ----- 전통 한국 화투 48장 -----
// Marcus Richert, based on Louie Mantia Jr. / CC BY-SA 4.0.
// https://www.marcusrichert.com/images/hwatu/ · resized to WebP; original bytes in /assets/game-media/.
// Artwork adaptations remain CC BY-SA 4.0; see README and the in-game credits.
const HWATU_ART = [
 "/assets/game-media/hwatu-00-764cec06fb15.webp",
 "/assets/game-media/hwatu-01-4d6c2e5400a4.webp",
 "/assets/game-media/hwatu-02-9d99ccd01090.webp",
 "/assets/game-media/hwatu-03-8664ca0ce24a.webp",
 "/assets/game-media/hwatu-04-504aeb5fd942.webp",
 "/assets/game-media/hwatu-05-3207cc4671a7.webp",
 "/assets/game-media/hwatu-06-ac6630de9ff1.webp",
 "/assets/game-media/hwatu-07-ee31ac61d35e.webp",
 "/assets/game-media/hwatu-08-54cb2203af89.webp",
 "/assets/game-media/hwatu-09-4e9fcc10436e.webp",
 "/assets/game-media/hwatu-10-4f89efd47be8.webp",
 "/assets/game-media/hwatu-11-5b8b2563a0f9.webp",
 "/assets/game-media/hwatu-12-4a537fc7e178.webp",
 "/assets/game-media/hwatu-13-1fc560be8a07.webp",
 "/assets/game-media/hwatu-14-17b52c1a5b28.webp",
 "/assets/game-media/hwatu-15-f406dc2959ec.webp",
 "/assets/game-media/hwatu-16-d1c6da38fcab.webp",
 "/assets/game-media/hwatu-17-1b969cee3e00.webp",
 "/assets/game-media/hwatu-18-a91940870a50.webp",
 "/assets/game-media/hwatu-19-fef258d2c652.webp",
 "/assets/game-media/hwatu-20-5a8633fdae23.webp",
 "/assets/game-media/hwatu-21-b22ddf8b506d.webp",
 "/assets/game-media/hwatu-22-82c9f47b4200.webp",
 "/assets/game-media/hwatu-23-92da6ba8ab63.webp",
 "/assets/game-media/hwatu-24-4da550d6e58f.webp",
 "/assets/game-media/hwatu-25-594ae7cc7c8e.webp",
 "/assets/game-media/hwatu-26-c347d67f912a.webp",
 "/assets/game-media/hwatu-27-012651e19cce.webp",
 "/assets/game-media/hwatu-28-302ba0ad20e0.webp",
 "/assets/game-media/hwatu-29-6cc1de0e91f1.webp",
 "/assets/game-media/hwatu-30-7d83f435a79f.webp",
 "/assets/game-media/hwatu-31-80e546eea17e.webp",
 "/assets/game-media/hwatu-32-2e97d8728902.webp",
 "/assets/game-media/hwatu-33-7609f14c0ba9.webp",
 "/assets/game-media/hwatu-34-bff9ace1c53e.webp",
 "/assets/game-media/hwatu-35-84fd0e9f4d12.webp",
 "/assets/game-media/hwatu-36-bcb932ad726a.webp",
 "/assets/game-media/hwatu-37-0d1a1c7533fa.webp",
 "/assets/game-media/hwatu-38-86caab397370.webp",
 "/assets/game-media/hwatu-39-55cf7cbe95a5.webp",
 "/assets/game-media/hwatu-40-fe8005497686.webp",
 "/assets/game-media/hwatu-41-575d706e097e.webp",
 "/assets/game-media/hwatu-42-2aef129500f2.webp",
 "/assets/game-media/hwatu-43-b6705841280f.webp",
 "/assets/game-media/hwatu-44-4abbf568269b.webp",
 "/assets/game-media/hwatu-45-4dc025719633.webp",
 "/assets/game-media/hwatu-46-9242b3842675.webp",
 "/assets/game-media/hwatu-47-de0a71811cbc.webp"
];
const svgCache={};
function cardSVG(c){
  if(svgCache[c.id])return svgCache[c.id];
  const label=c.k==='bonus'?`보너스 ${c.pv}피`:`${c.m}월 ${MN[c.m]} ${KN[c.k]}`;
  const head=`<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}"><title>${label}</title>`;
  const art=c.k==='bonus'
    ? `<rect width="60" height="90" rx="3" fill="#e7221b"/><rect x="4" y="4" width="52" height="82" rx="2" fill="#fff4d8" stroke="#251a14" stroke-width="1.2"/><path d="M8 8h44v74H8z" fill="none" stroke="#c49636"/><circle cx="30" cy="38" r="20" fill="#bf241c" stroke="#e5bb58" stroke-width="2"/><text x="30" y="47" text-anchor="middle" font-size="28" font-weight="bold" fill="#fff4d8">${c.pv}</text><text x="30" y="67" text-anchor="middle" font-size="10" font-weight="bold" fill="#681b16">${c.pv===2?'쌍피':'쓰리피'}</text><text x="30" y="78" text-anchor="middle" font-size="6" fill="#681b16">보너스</text>`
    : `<image href="${HWATU_ART[c.id]}" width="60" height="90" preserveAspectRatio="none"/>`;
  return svgCache[c.id]=head+art+'</svg>';
}
const backSVG=`<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="화투 뒷면"><defs><pattern id="hwatu-back" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0h3v3H0z" fill="#b51c13"/><path d="M0 0l3 3M3 0L0 3" stroke="#e7442c" stroke-width=".35"/></pattern></defs><rect width="60" height="90" rx="3" fill="#8b140d"/><rect x="1.5" y="1.5" width="57" height="87" rx="2" fill="url(#hwatu-back)" stroke="#e9442c"/><rect x="4" y="4" width="52" height="82" rx="1" fill="none" stroke="#8b140d" stroke-width="1.2"/></svg>`;


export {cardSVG,backSVG};
