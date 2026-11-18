/* Shared original artwork for group rooms and the flat screw puzzle.
 * Keep IDs and order stable: collections and room appearances depend on them. */
(function(){
 'use strict';
 const PICTURES=Object.freeze([
  {
    "id": "window-cat",
    "name": "창가 고양이",
    "theme": "sunbeam",
    "colors": [
      "#F6DFC2",
      "#FFF4E6"
    ],
    "src": "/assets/screw-flat/window-cat-v1.webp"
  },
  {
    "id": "rabbit-tea",
    "name": "토끼의 찻시간",
    "theme": "teatime",
    "colors": [
      "#F4DDD9",
      "#FFF4E9"
    ],
    "src": "/assets/screw-flat/rabbit-tea-v1.webp"
  },
  {
    "id": "bear-picnic",
    "name": "곰의 소풍",
    "theme": "picnic",
    "colors": [
      "#DCECCF",
      "#FFF2D5"
    ],
    "src": "/assets/screw-flat/bear-picnic-v1.webp"
  },
  {
    "id": "puppy-beach",
    "name": "강아지의 바다",
    "theme": "seaside",
    "colors": [
      "#D4EBEF",
      "#FFF0D7"
    ],
    "src": "/assets/screw-flat/puppy-beach-v1.webp"
  },
  {
    "id": "sky-whale",
    "name": "별바다 고래",
    "theme": "starlight",
    "colors": [
      "#DCE5EF",
      "#EAE4DC"
    ],
    "src": "/assets/screw-flat/sky-whale-v1.webp"
  },
  {
    "id": "cozy-room",
    "name": "포근한 우리집",
    "theme": "lounge",
    "colors": [
      "#EFDBC1",
      "#FFF0DF"
    ],
    "src": "/assets/screw-flat/cozy-room-v1.webp"
  },
  {
    "id": "cozy-001-woodland-fox",
    "name": "숲속 여우 도서관",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/001-woodland-fox-v1.webp"
  },
  {
    "id": "cozy-002-otter-river",
    "name": "수달의 강가 소풍",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/002-otter-river-v1.webp"
  },
  {
    "id": "cozy-003-hedgehog-bakery",
    "name": "고슴도치 빵집",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/003-hedgehog-bakery-v1.webp"
  },
  {
    "id": "cozy-004-panda-bamboo",
    "name": "판다의 대나무 정원",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/004-panda-bamboo-v1.webp"
  },
  {
    "id": "cozy-005-shiba-camping",
    "name": "강아지의 캠핑",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/005-shiba-camping-v1.webp"
  },
  {
    "id": "cozy-006-penguin-snow",
    "name": "펭귄의 눈집",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/006-penguin-snow-v1.webp"
  },
  {
    "id": "cozy-007-koala-greenhouse",
    "name": "코알라 온실",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/007-koala-greenhouse-v1.webp"
  },
  {
    "id": "cozy-008-capybara-springs",
    "name": "카피바라 온천",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/008-capybara-springs-v1.webp"
  },
  {
    "id": "cozy-009-squirrel-orchard",
    "name": "다람쥐 과수원",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/009-squirrel-orchard-v1.webp"
  },
  {
    "id": "cozy-010-raccoon-stargazer",
    "name": "너구리의 별 관측",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/010-raccoon-stargazer-v1.webp"
  },
  {
    "id": "cozy-011-deer-meadow",
    "name": "아기사슴 꽃밭",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/011-deer-meadow-v1.webp"
  },
  {
    "id": "cozy-012-polar-bear-cocoa",
    "name": "북극곰의 코코아",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/012-polar-bear-cocoa-v1.webp"
  },
  {
    "id": "cozy-013-seal-lighthouse",
    "name": "물범과 등대",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/013-seal-lighthouse-v1.webp"
  },
  {
    "id": "cozy-014-duckling-rain",
    "name": "오리의 비 오는 날",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/014-duckling-rain-v1.webp"
  },
  {
    "id": "cozy-015-red-panda-autumn",
    "name": "레서판다 가을숲",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/015-red-panda-autumn-v1.webp"
  },
  {
    "id": "cozy-016-alpaca-knitting",
    "name": "알파카 뜨개방",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/016-alpaca-knitting-v1.webp"
  },
  {
    "id": "cozy-017-hamster-florist",
    "name": "햄스터 꽃집",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/017-hamster-florist-v1.webp"
  },
  {
    "id": "cozy-018-owl-bookshop",
    "name": "부엉이 책방",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/018-owl-bookshop-v1.webp"
  },
  {
    "id": "cozy-019-bunny-moon",
    "name": "달빛 토끼",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/019-bunny-moon-v1.webp"
  },
  {
    "id": "cozy-020-kitten-pottery",
    "name": "아기고양이 도예방",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/020-kitten-pottery-v1.webp"
  },
  {
    "id": "cozy-021-puppy-picnic",
    "name": "강아지 들꽃 소풍",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/021-puppy-picnic-v1.webp"
  },
  {
    "id": "cozy-022-fawn-forest",
    "name": "사슴의 숲속 오두막",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/022-fawn-forest-v1.webp"
  },
  {
    "id": "cozy-023-corgi-train",
    "name": "코기의 기차 여행",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/023-corgi-train-v1.webp"
  },
  {
    "id": "cozy-024-turtle-lotus",
    "name": "거북이 연꽃 연못",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/024-turtle-lotus-v1.webp"
  },
  {
    "id": "cozy-025-chick-sunflower",
    "name": "병아리 해바라기",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/025-chick-sunflower-v1.webp"
  },
  {
    "id": "cozy-026-ferret-attic",
    "name": "페럿의 다락방",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/026-ferret-attic-v1.webp"
  },
  {
    "id": "cozy-027-quokka-beach",
    "name": "쿼카의 바닷가",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/027-quokka-beach-v1.webp"
  },
  {
    "id": "cozy-028-lamb-garden",
    "name": "어린양 장미 정원",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/028-lamb-garden-v1.webp"
  },
  {
    "id": "cozy-029-fox-snow-lantern",
    "name": "눈길의 여우",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/029-fox-snow-lantern-v1.webp"
  },
  {
    "id": "cozy-030-bear-honey",
    "name": "곰의 꿀 저장소",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/030-bear-honey-v1.webp"
  },
  {
    "id": "cozy-031-sunroom-books",
    "name": "햇살 독서실",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/031-sunroom-books-v1.webp"
  },
  {
    "id": "cozy-032-attic-studio",
    "name": "다락방 작업실",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/032-attic-studio-v1.webp"
  },
  {
    "id": "cozy-033-rain-cafe",
    "name": "비 오는 카페",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/033-rain-cafe-v1.webp"
  },
  {
    "id": "cozy-034-forest-cabin",
    "name": "숲속 오두막",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/034-forest-cabin-v1.webp"
  },
  {
    "id": "cozy-035-seaside-kitchen",
    "name": "바닷가 주방",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/035-seaside-kitchen-v1.webp"
  },
  {
    "id": "cozy-036-flower-balcony",
    "name": "꽃이 핀 발코니",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/036-flower-balcony-v1.webp"
  },
  {
    "id": "cozy-037-moon-bedroom",
    "name": "달빛 침실",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/037-moon-bedroom-v1.webp"
  },
  {
    "id": "cozy-038-glass-greenhouse",
    "name": "유리 온실 쉼터",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/038-glass-greenhouse-v1.webp"
  },
  {
    "id": "cozy-039-rooftop-garden",
    "name": "옥상 정원",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/039-rooftop-garden-v1.webp"
  },
  {
    "id": "cozy-040-book-cafe",
    "name": "골목 책 카페",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/040-book-cafe-v1.webp"
  },
  {
    "id": "cozy-041-countryside-porch",
    "name": "시골집 툇마루",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/041-countryside-porch-v1.webp"
  },
  {
    "id": "cozy-042-winter-library",
    "name": "겨울 도서관",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/042-winter-library-v1.webp"
  },
  {
    "id": "cozy-043-music-room",
    "name": "작은 음악실",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/043-music-room-v1.webp"
  },
  {
    "id": "cozy-044-baking-kitchen",
    "name": "쿠키 굽는 주방",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/044-baking-kitchen-v1.webp"
  },
  {
    "id": "cozy-045-garden-teahouse",
    "name": "정원의 찻집",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/045-garden-teahouse-v1.webp"
  },
  {
    "id": "cozy-046-vintage-workshop",
    "name": "빈티지 공방",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/046-vintage-workshop-v1.webp"
  },
  {
    "id": "cozy-047-blue-window-nook",
    "name": "파란 창가",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/047-blue-window-nook-v1.webp"
  },
  {
    "id": "cozy-048-indoor-courtyard",
    "name": "실내 작은 정원",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/048-indoor-courtyard-v1.webp"
  },
  {
    "id": "cozy-049-camp-caravan",
    "name": "숲속 캠핑카",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/049-camp-caravan-v1.webp"
  },
  {
    "id": "cozy-050-cloud-reading-room",
    "name": "구름 독서방",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/050-cloud-reading-room-v1.webp"
  },
  {
    "id": "cozy-051-cherry-river",
    "name": "벚꽃 강변",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/051-cherry-river-v1.webp"
  },
  {
    "id": "cozy-052-lavender-hills",
    "name": "라벤더 언덕",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/052-lavender-hills-v1.webp"
  },
  {
    "id": "cozy-053-emerald-lake",
    "name": "초록빛 호수",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/053-emerald-lake-v1.webp"
  },
  {
    "id": "cozy-054-tulip-windmill",
    "name": "튤립 풍차",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/054-tulip-windmill-v1.webp"
  },
  {
    "id": "cozy-055-sunset-harbor",
    "name": "노을 항구",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/055-sunset-harbor-v1.webp"
  },
  {
    "id": "cozy-056-autumn-bridge",
    "name": "가을 돌다리",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/056-autumn-bridge-v1.webp"
  },
  {
    "id": "cozy-057-snowy-village",
    "name": "눈 내린 마을",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/057-snowy-village-v1.webp"
  },
  {
    "id": "cozy-058-island-cove",
    "name": "섬의 작은 만",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/058-island-cove-v1.webp"
  },
  {
    "id": "cozy-059-rolling-tea-fields",
    "name": "차밭 산책길",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/059-rolling-tea-fields-v1.webp"
  },
  {
    "id": "cozy-060-sunflower-road",
    "name": "해바라기 길",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/060-sunflower-road-v1.webp"
  },
  {
    "id": "cozy-061-wisteria-gate",
    "name": "등나무 정원 문",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/061-wisteria-gate-v1.webp"
  },
  {
    "id": "cozy-062-river-mill",
    "name": "물레방아 집",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/062-river-mill-v1.webp"
  },
  {
    "id": "cozy-063-coastal-railway",
    "name": "바다 옆 철길",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/063-coastal-railway-v1.webp"
  },
  {
    "id": "cozy-064-golden-rice-fields",
    "name": "황금 들판",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/064-golden-rice-fields-v1.webp"
  },
  {
    "id": "cozy-065-forest-waterfall",
    "name": "숲속 폭포",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/065-forest-waterfall-v1.webp"
  },
  {
    "id": "cozy-066-moonlit-lake",
    "name": "달빛 호수",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/066-moonlit-lake-v1.webp"
  },
  {
    "id": "cozy-067-peach-orchard",
    "name": "복숭아 과수원",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/067-peach-orchard-v1.webp"
  },
  {
    "id": "cozy-068-desert-oasis",
    "name": "사막의 오아시스",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/068-desert-oasis-v1.webp"
  },
  {
    "id": "cozy-069-rainbow-valley",
    "name": "무지개 골짜기",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/069-rainbow-valley-v1.webp"
  },
  {
    "id": "cozy-070-winter-tram",
    "name": "겨울 전차길",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/070-winter-tram-v1.webp"
  },
  {
    "id": "cozy-071-floating-island",
    "name": "하늘 정원 섬",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/071-floating-island-v1.webp"
  },
  {
    "id": "cozy-072-whale-clouds",
    "name": "구름 속 고래",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/072-whale-clouds-v1.webp"
  },
  {
    "id": "cozy-073-mushroom-village",
    "name": "버섯 마을",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/073-mushroom-village-v1.webp"
  },
  {
    "id": "cozy-074-star-train",
    "name": "별빛 기차",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/074-star-train-v1.webp"
  },
  {
    "id": "cozy-075-moon-garden",
    "name": "달 정원",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/075-moon-garden-v1.webp"
  },
  {
    "id": "cozy-076-undersea-library",
    "name": "바닷속 도서관",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/076-undersea-library-v1.webp"
  },
  {
    "id": "cozy-077-teacup-cottage",
    "name": "찻잔 오두막",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/077-teacup-cottage-v1.webp"
  },
  {
    "id": "cozy-078-clockwork-garden",
    "name": "시계 태엽 정원",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/078-clockwork-garden-v1.webp"
  },
  {
    "id": "cozy-079-firefly-boats",
    "name": "반딧불 배",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/079-firefly-boats-v1.webp"
  },
  {
    "id": "cozy-080-crystal-cavern",
    "name": "수정 동굴",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/080-crystal-cavern-v1.webp"
  },
  {
    "id": "cozy-081-cloud-castle",
    "name": "구름 위 성",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/081-cloud-castle-v1.webp"
  },
  {
    "id": "cozy-082-treehouse-village",
    "name": "나무 위 마을",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/082-treehouse-village-v1.webp"
  },
  {
    "id": "cozy-083-starlight-post",
    "name": "별빛 우체국",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/083-starlight-post-v1.webp"
  },
  {
    "id": "cozy-084-enchanted-carousel",
    "name": "숲속 회전목마",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/084-enchanted-carousel-v1.webp"
  },
  {
    "id": "cozy-085-sky-sailing",
    "name": "하늘 돛단배",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/085-sky-sailing-v1.webp"
  },
  {
    "id": "cozy-086-luminous-jellyfish",
    "name": "빛나는 해파리",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/086-luminous-jellyfish-v1.webp"
  },
  {
    "id": "cozy-087-secret-door",
    "name": "숲의 비밀 문",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/087-secret-door-v1.webp"
  },
  {
    "id": "cozy-088-star-observatory",
    "name": "별 관측소",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/088-star-observatory-v1.webp"
  },
  {
    "id": "cozy-089-rainbow-waterfall",
    "name": "빛깔 폭포",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/089-rainbow-waterfall-v1.webp"
  },
  {
    "id": "cozy-090-dream-garden-bus",
    "name": "꿈의 정원 버스",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/090-dream-garden-bus-v1.webp"
  },
  {
    "id": "cozy-091-strawberry-tea",
    "name": "딸기 티타임",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/091-strawberry-tea-v1.webp"
  },
  {
    "id": "cozy-092-citrus-breakfast",
    "name": "레몬빛 아침",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/092-citrus-breakfast-v1.webp"
  },
  {
    "id": "cozy-093-ceramic-flowers",
    "name": "도자기와 꽃",
    "theme": "teatime",
    "colors": [
      "#f4e1df",
      "#fff8f7"
    ],
    "src": "/assets/cozy-scenes/093-ceramic-flowers-v1.webp"
  },
  {
    "id": "cozy-094-summer-fruit",
    "name": "여름 과일 바구니",
    "theme": "sunbeam",
    "colors": [
      "#f1e9d6",
      "#fdfbf3"
    ],
    "src": "/assets/cozy-scenes/094-summer-fruit-v1.webp"
  },
  {
    "id": "cozy-095-cozy-boardgames",
    "name": "우리의 놀이 시간",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/095-cozy-boardgames-v1.webp"
  },
  {
    "id": "cozy-096-garden-tools",
    "name": "정원사의 오후",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/096-garden-tools-v1.webp"
  },
  {
    "id": "cozy-097-night-desserts",
    "name": "달밤 디저트",
    "theme": "starlight",
    "colors": [
      "#e4e5f2",
      "#f8f8ff"
    ],
    "src": "/assets/cozy-scenes/097-night-desserts-v1.webp"
  },
  {
    "id": "cozy-098-seashell-notes",
    "name": "바다의 작은 수집",
    "theme": "seaside",
    "colors": [
      "#deedf1",
      "#f5fbfc"
    ],
    "src": "/assets/cozy-scenes/098-seashell-notes-v1.webp"
  },
  {
    "id": "cozy-099-winter-knit",
    "name": "겨울 뜨개 바구니",
    "theme": "lounge",
    "colors": [
      "#f1e2cc",
      "#fffaf2"
    ],
    "src": "/assets/cozy-scenes/099-winter-knit-v1.webp"
  },
  {
    "id": "cozy-100-picnic-basket",
    "name": "들꽃 소풍 바구니",
    "theme": "picnic",
    "colors": [
      "#e5eddc",
      "#f8fbf4"
    ],
    "src": "/assets/cozy-scenes/100-picnic-basket-v1.webp"
  }
].map(p=>Object.freeze({...p,colors:Object.freeze(p.colors)})));
 // Finalized to the release timestamp before publication. Older rooms keep their original cover.
 const GROUP_NEW_SINCE='2026-11-18T07:47:56.514Z';
 const LEGACY_GROUP_ORDER=[2,5,3,1,4,0];
 function forGroup(room={}){
  let hash=2166136261;
  for(const ch of String(room.id||'').toLowerCase())hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  const created=Date.parse(room.created_at);
  return Number.isFinite(created)&&created>=Date.parse(GROUP_NEW_SINCE)?PICTURES[hash%PICTURES.length]:PICTURES[LEGACY_GROUP_ORDER[hash%LEGACY_GROUP_ORDER.length]];
 }
 const api=Object.freeze({PICTURES,GROUP_NEW_SINCE,forGroup});
 if(typeof window!=='undefined')window.OjjudaCozyArt=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();

