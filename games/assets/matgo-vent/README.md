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


## 2026-10-14 추가 화풀이

- burst.png, slash.png, tomato.png, bat.png: 내장 이미지 생성 도구로 만든 1254 × 1254 RGBA 원본. 투명도와 원본 바이트를 유지합니다.
- 따발총 8연사, 칼질 2회, 토마토 포물선과 씨앗·과육 효과, 배트 휘두르기를 각각 별도로 애니메이션합니다.
- 10개 효과를 매 클릭마다 균등 무작위로 선택합니다. 연속해서 같은 효과가 나올 수 있으며, 응답이 불확실한 결제는 기존 영수증의 효과를 재생합니다.
- 새 효과도 로딩 성공 → 1쭈 결제 확인 → 모션/효과음 순서이며, 소리 끄기·동작 줄이기·화면 숨김 설정을 따릅니다.

### 공통 생성 프롬프트

Use case: stylized-concept. Asset type: high-quality 2D mobile game animation sprite for a Korean card game. Style: richly detailed hand-painted semi-realistic 3D game inventory illustration, strong readable silhouette, warm highlights from upper left, soft blue fill, crisp material texture, like premium polished steel-and-wood game props. Square canvas, 1024x1024 or larger. True transparent alpha background; no colored backdrop, no ground, no cast shadow outside the object. One isolated object only. No people, hands, text, logo, watermark, border, ammunition, flash, blood, or motion lines. This prop will be animated separately in code.

### burst

A single stylized vintage submachine gun game prop for a comic rapid-fire animation. Long barrel points horizontally RIGHT, wooden stock extends LEFT, black grip and rounded drum magazine are BELOW the barrel. Full side view, upright orientation, entire object visible with 10% padding. Dark polished gunmetal, restrained brass details, rich walnut stock, finely painted wear and bright metal edges.

### slash

A single polished chef's knife game prop for a comic slashing animation. One broad clean silver blade points diagonally toward the UPPER RIGHT, dark walnut handle at the LOWER LEFT. Entire object visible, centered diagonal composition with 12% padding. Fine steel reflections, subtle blade bevel, richly textured wood handle with three brass rivets. No scratches suggesting injury, no stains.

### tomato

A single plump ripe red tomato game prop for a comic tomato-throw animation. One glossy whole tomato centered, three-quarter view, crisp green stem and a few curled leaves on top, natural rounded lobes, tiny water droplets and nuanced orange-red reflected highlights. Entire object visible with 16% padding. No plate, no cut tomato, no splatter baked into the image.

### bat

A single wooden baseball bat game prop for a comic swinging animation. Thick rounded barrel points diagonally toward the UPPER RIGHT, narrow handle and knob at LOWER LEFT. Entire bat visible, centered diagonal composition with 10% padding. Honey-brown varnished wood with detailed longitudinal grain, dark charcoal wrapped grip, realistic rounded end, subtle scuffs and polished highlights.


## 2026-10-14 펜싱칼 교체

사용자 요청으로 식칼 연출을 펜싱으로 교체했습니다. `fencing-v1.png`는 내장 image_gen 도구로 만든 1254 × 1254 투명 RGBA 원본이며 변환 없이 사용합니다. 기존 `slash` 결제 식별자는 유지하지만 게임은 새 펜싱 그림만 불러옵니다. 두 번 가볍게 뻗었다가 거두는 동작, 둥근 끝의 작은 빛과 가벼운 금속음을 사용합니다. 이전 `slash.png`는 보관만 합니다.

생성 프롬프트: Replace the kitchen knife completely with a modern sporting fencing épée. Keep only the polished illustrated game-asset rendering style and diagonal composition. One long, very slender silver blade with a visible rounded blue safety button at the upper-right tip, silver bell handguard, navy wrapped straight handle and metal pommel at lower left. Friendly sports-equipment tone, detailed illustrated metal highlights and grip texture, no broad cutting edge, no serrations. Entire object on a square transparent canvas. No person, hand, blood, damage, text, logo, frame, shadow or motion streaks.
