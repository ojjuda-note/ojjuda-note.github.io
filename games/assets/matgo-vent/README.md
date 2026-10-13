# 화풀이 그림과 효과음

2026-10-13. Built-in image generation으로 제작한 투명 PNG 원본입니다. 별도 재압축이나 픽셀 편집 없이 사용합니다.

- gun.png, hammer.png, glove.png, bomb.png: 1254 × 1254 RGBA.
- 동작은 matgo-deck-tools.mjs / .css에서 구현합니다. 번개는 분기된 벡터 선과 발광 효과입니다.
- matgo-vent-sound.mjs는 외부 음원 없이 Web Audio로 만든 전용 효과음입니다. 소리 끄기, 화면 숨김, 동작 종료 시 예약된 소리도 멈춥니다.
- 이미지 로딩 성공 후 결제하고, 결제 영수증 확인 뒤 모션과 효과음을 재생합니다.

## Generation prompts

### gun

Use case: stylized-concept. Asset type: a single transparent animated prop sprite for a polished Korean arcade card game. Premium hand-painted 3D game illustration, sculpted volume, sophisticated layered material shading, crisp bevels and tiny wear details, warm upper-left key light and cool rim highlights, readable silhouette at 120px. Square canvas, whole object centered and isolated with 10% transparent breathing room. Genuinely transparent background and no floor shadow. No people, hands, characters, lettering, logos, watermarks, frame, badge, muzzle flash, motion trails, or surrounding props. This is a finished detailed game sprite, not a flat vector icon or simple emoji. Subject: an exaggerated arcade revolver in near side view, barrel horizontal and pointing to the RIGHT. Rich dark steel, polished gunmetal edges, warm brass cylinder and trigger guard, visible cylinder flutes, screws and compact mechanical detailing, deep walnut curved grip with finely carved checkering. Chunky playful proportions with a powerful clear silhouette; appealing and polished, not photorealistic.

### hammer

Use case: stylized-concept. Asset type: a single transparent animated prop sprite for a polished Korean arcade card game. Premium hand-painted 3D game illustration, sculpted volume, sophisticated layered material shading, crisp bevels and tiny wear details, warm upper-left key light and cool rim highlights, readable silhouette at 120px. Square canvas, whole object centered and isolated with 10% transparent breathing room. Genuinely transparent background and no floor shadow. No people, hands, characters, lettering, logos, watermarks, frame, badge, muzzle flash, motion trails, or surrounding props. This is a finished detailed game sprite, not a flat vector icon or simple emoji. Subject: one hefty arcade mallet, upright with the head in the upper third and the handle pointing DOWN. Broad steel head with large bevels, brushed metal faces, darker forged inset panels, brass corner bands and small rivets; long walnut shaft tightly wrapped in chestnut leather with seams and a brass pommel. Three-quarter side view so the front and top planes of the head are visible. Rich tactile materials and weight.

### glove

Use case: stylized-concept. Asset type: a single transparent animated prop sprite for a polished Korean arcade card game. Premium hand-painted 3D game illustration, sculpted volume, sophisticated layered material shading, crisp bevels and tiny wear details, warm upper-left key light and cool rim highlights, readable silhouette at 120px. Square canvas, whole object centered and isolated with 10% transparent breathing room. Genuinely transparent background and no floor shadow. No people, hands, characters, lettering, logos, watermarks, frame, badge, muzzle flash, motion trails, or surrounding props. This is a finished detailed game sprite, not a flat vector icon or simple emoji. Subject: one chunky crimson red boxing glove ready to punch, knuckles pointing toward the upper RIGHT, wrist cuff at lower LEFT. Three-quarter view with a rounded inflated knuckle surface, sculpted thumb, fine leather grain, sewn double stitches, dark red creases, ivory edging and warm brass-toned piping around a substantial cuff. Rich shaded volumes, bright red highlights, dark burgundy shadows. No arm, no hand emerging.

### bomb

Use case: stylized-concept. Asset type: a single transparent animated prop sprite for a polished Korean arcade card game. Premium hand-painted 3D game illustration, sculpted volume, sophisticated layered material shading, crisp bevels and tiny wear details, warm upper-left key light and cool rim highlights, readable silhouette at 120px. Square canvas, whole object centered and isolated with 10% transparent breathing room. Genuinely transparent background and no floor shadow. No people, hands, characters, lettering, logos, watermarks, frame, badge, muzzle flash, motion trails, or surrounding props. This is a finished detailed game sprite, not a flat vector icon or simple emoji. Subject: one spherical cartoon iron bomb with a short curved braided fuse at its upper right, the fuse is UNLIT. The orb has deep blue-black forged steel, brushed curved highlights, subtle scuffs, a raised equator seam with tiny brass rivets, a thick bronze fuse socket and clearly woven brown fuse fibers. Three-quarter view, orb fills most of the sprite, slightly exaggerated playful arcade proportions.
