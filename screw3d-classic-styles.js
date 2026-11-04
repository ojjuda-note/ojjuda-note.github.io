/* Visual finish for the fourteen classic screw-box puzzles.
   Only decorative colors and material tags change; never geometry or fasteners. */
const classicNames = new Set([
  '큐브','집','피자','2층 피자','자동차','모자','무지개 다리','주전자','선풍기',
  '로켓','케이크','등대','크리스마스트리','성','에펠탑',
  '작은 블럭','블럭 기차','네모 블럭'
]);
const tint = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
const premiumMaterials = new Set(['paint','polished','glass','ceramic','metal','icing','stone','fabric','wood','leaf']);
export const isClassicPuzzle = name => classicNames.has(name);

export function applyClassicStyle(M) {
  if (!M || !classicNames.has(M.name)) return M;
  const name = M.name;
  const cells = M.els.filter(e => !!e.cell);
  let ordinal = 0;

  for (const E of M.els) {
    const color = String(E.color || '').toUpperCase();
    const cell = E.cell;
    if (E.kind === 'plate' && E.flat) {
      // Colored glass stays glass; connecting bars remain neutral metal.
      E.material = color === '#9FD8F5' ? 'glass' : 'metal';
      if (color === '#9FD8F5') E.color = '#77CBF0';
      else if (color === '#D9DEEE') E.color = '#C5D4E2';
      continue;
    }

    if (['큐브','작은 블럭','블럭 기차','네모 블럭'].includes(name)) {
      E.material = 'paint';
      if (cell) E.color = tint(['#7BA8E6','#7FD4C4','#F8D18B','#C4AAEE','#F5A4B3','#A8C9EF'],
        cell[0] * 7 + cell[1] * 11 + cell[2] * 13);
    } else if (name === '집') {
      E.material = cell ? 'stone' : 'wood';
      if (cell) E.color = tint(['#F1E1CF','#E8D4BF','#F5E8D9'], cell[0] + cell[1] * 2);
      else if (E.geom?.faces?.length === 5 && E.geom?.verts?.length === 6) { E.color = '#AD655E'; E.material = 'paint'; }
      else if (color === '#FFD66B' || color === '#F2B84B') E.color = '#E9BE68';
      else if (color === '#A0714F' || color === '#B9AFA0') E.color = '#866551';
    } else if (name === '피자' || name === '2층 피자') {
      E.material = 'icing';
      if (E.kind === 'block') E.color = tint(['#F2BA64','#EAA352','#EBC078','#F7CE82'],ordinal++);
      else if (E.kind === 'wheel') E.color = tint(['#BA5545','#CA7158','#A05D44','#C76848'],ordinal++);
    } else if (name === '자동차') {
      E.material = 'paint';
      if (cell) E.color = cell[1] ? '#A5C7E5' : tint(['#285A91','#3074AA','#2D659B'],cell[0]);
      else if (color === '#2E3358') { E.color = '#252937'; E.material = 'polished'; }
      else if (color === '#9FD8F5') { E.color = '#8BD3EB'; E.material = 'glass'; }
    } else if (name === '모자') {
      E.material = 'fabric';
      if (color === '#F0679A') E.color = '#A94D6B';
      else if (color === '#FFD66B') E.color = '#F3D08B';
      else if (color === '#F9C9D8') E.color = '#E6A6B5';
      else E.color = '#394264';
    } else if (name === '무지개 다리') {
      E.material = 'stone';
      if (cell) E.color = cell[1] ? '#B0B6C3' : '#E2CBAA';
      if (E.parts?.length) {
        const rainbow=['#D86574','#E7A767','#F0D47D','#6FB99C','#75ACD7','#A291C9'];
        E.parts.forEach((p,i)=>{p.color=tint(rainbow,Math.floor(i * rainbow.length / E.parts.length));});
        E.material='paint';
      }
      if (E.kind==='wheel') {E.color='#F6D28B';E.material='polished';}
    } else if (name === '주전자') {
      E.material = 'ceramic';
      if (color === '#8FA7D9') E.color='#607EA6';
      else if (color === '#9FD8F5') E.color='#B4E5EE';
      else if (color === '#C6E6FF') E.color='#E0F3F7';
      else if (color === '#F9C9D8') E.color='#8BB9C9';
      else if (color === '#F0679A') E.color='#C58B8D';
      else if (color === '#F2B84B') E.color='#BF935C';
      if (E.parts) E.parts.forEach(p=>{p.color=p.color==='#F2B84B'?'#C79F73':'#9CB8C3';});
    } else if (name === '선풍기') {
      E.material = 'metal';
      if (color === '#F0679A') E.color='#E1A6AF';
      else if (color === '#8FA7D9') E.color='#829FB1';
      else if (color === '#C6E6FF' || color === '#E0D4FF') E.color='#D0E4E9';
      else if (['#9FD8F5','#CDEFD9','#FFE3A6','#F9C9D8'].includes(color)) { E.color=tint(['#7ABFC1','#94D1CB','#ADDCD8'],ordinal++); E.material='polished'; }
    } else if (name === '로켓') {
      E.material = 'paint';
      if (color === '#F0679A') E.color='#CD4E5C';
      else if (color === '#FFF6EC') E.color='#F3F1EB';
      else if (color === '#5B8DEF') E.color='#397EAF';
      else if (color === '#FFD66B') E.color='#E9B65D';
      else if (color === '#9FD8F5') {E.color='#79CBEB'; E.material='glass';}
      else if (color === '#8E93B8') {E.color='#667889'; E.material='metal';}
    } else if (name === '케이크') {
      E.material = 'icing';
      if (color === '#D9DEEE') {E.color='#D6D9DE';E.material='polished';}
      else if (color === '#F9C9D8') E.color='#F4B3C8';
      else if (color === '#FFF6EC') E.color='#FFF0D6';
      else if (color === '#FFE3A6') E.color='#F4D3AC';
      else if (color === '#FFB347') E.color='#FFD077';
      else if (color === '#F0679A') E.color='#C94F69';
      else if (color === '#9FD8F5' || color === '#CDEFD9') E.color='#B1D7E4';
    } else if (name === '등대') {
      E.material = 'paint';
      if (cell) E.color=tint(['#C9D7E1','#B7CDDA'],cell[0]+cell[2]);
      else if (color === '#F0679A') E.color='#C85963';
      else if (color === '#FFF6EC') E.color='#F9F4E9';
      else if (color === '#FFD66B') {E.color='#F3CC70';E.material='glass';}
      else if (color === '#3A3F66') E.color='#344A67';
    } else if (name === '크리스마스트리') {
      E.material = 'leaf';
      if (['#2FB99A','#3FC7A6','#56D3B2','#6BDDBE'].includes(color)) E.color=tint(['#397C59','#3F9169','#54A577','#64AD81'],ordinal++);
      else if (color === '#FFD66B') {E.color='#F6D37B';E.material='polished';}
      else if (color === '#A0714F') {E.color='#90705D';E.material='wood';}
      else if (color === '#F0679A') E.color='#B9576A';
    } else if (name === '성') {
      E.material='stone';
      if (cell) E.color=tint(['#C5BEB1','#DDD5C5','#CCC5B6','#D5CEBF'], cell[0]+cell[1]+cell[2]);
      else if (color === '#5B8DEF') {E.color='#6C789D';E.material='paint';}
      else if (color === '#A0714F') E.color='#89624D';
      else if (color === '#F2B84B') E.color='#B99D6C';
    } else if (name === '에펠탑') {
      E.material='metal';
      if (color === '#CDEFD9') {E.color='#D3CFBE';E.material='stone';}
      else if (color === '#F2B84B') E.color='#A7805B';
      else if (color === '#8E7BD6') E.color='#856A5A';
      else if (color === '#F0679A') E.color='#D6B18B';
      else E.color=tint(['#A27656','#B78A62','#8D674D'],ordinal++);
    }
    if (!premiumMaterials.has(E.material)) E.material='paint';
  }
  return M;
}
