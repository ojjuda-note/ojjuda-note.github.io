# 이름 중심 앱 아이콘

2026-11-20 디자인은 **아지트·공원·파장 이름을 크게 읽을 수 있게** 만든 아이콘이다. 둥글고 굵은 크림색 한글을 중심에 두고, 앱별 배경색과 작은 계절·행사 장식을 더한다. 세 앱에 각각 8개 테마를 적용해 총 24종을 만든다. 제작 기록의 revision은 `20261120-korean-wordmarks-1`이며, 실제 웹 배포 revision은 별도 생성기가 원본 해시로 정한다.

## 구성과 색상

글자 윤곽선의 기본 폭은 1024px 원본에서 아지트 722px, 공원·파장 698px다. 글자 전체에 -3도 기울기를 적용한다. 글자 채움은 `#FFFCF2`에서 `#F9E8CE`로 이어지는 크림색이고, 아래쪽에 테마 강조색을 살짝 겹친다. 작은 장식은 글자의 위·아래에 둔다.

| 테마 | 아지트 배경 | 공원 배경 | 파장 배경 | 강조색 | 주요 장식 |
| --- | --- | --- | --- | --- | --- |
| 봄 `spring` | `#155D56` | `#3D6D43` | `#825176` | `#F5B6CE` | 꽃·잎 |
| 여름 `summer` | `#086578` | `#33703E` | `#7152A0` | `#89E3D0` | 해·물결 |
| 가을 `autumn` | `#17594F` | `#526338` | `#783D59` | `#F6BD70` | 단풍잎 |
| 겨울 `winter` | `#234F70` | `#2D5B55` | `#585985` | `#B7DDEC` | 눈송이 |
| 새해 `newyear` | `#173F4C` | `#294E40` | `#553B69` | `#F8D487` | 빛살·별 |
| 설 `seollal` | `#19575B` | `#3C604A` | `#78425D` | `#F3BAC7` | 매듭 |
| 추석 `chuseok` | `#435848` | `#505E32` | `#694868` | `#F2CF84` | 보름달·잎 |
| 크리스마스 `christmas` | `#124D40` | `#2A533D` | `#752E49` | `#F3C880` | 산타 모자·별 |

정확한 도형과 추가 장식색은 [제작 스크립트](../../../ops/render-wordmark-app-icons.py)의 `THEMES`, `decorations()`, `svg_source()`를 기준으로 한다. 일반 아이콘은 중앙 800×800 영역을 잘라 축소하고, 마스킹용은 전체 1024×1024를 축소한다. 아래 미리보기는 일반 아이콘과 같은 자르기 영역을 사용한다. 다양한 기기 마스크에서 글자가 잘리지 않는지는 별도로 확인한다.

## 파일과 미리보기

| 경로 | 용도 |
| --- | --- |
| `sources/<앱>/<테마>.svg` | 글자를 SVG path로 바꾼 24개 벡터 제작 원본. 외부 글꼴 없이 표시 가능 |
| `../seasonal/<앱>/<테마>.png` | 웹과 Android가 공유하는 불투명 1024×1024 PNG 24개 |
| `../<앱>-1024.png` | 현재 여름 원본의 중앙 800×800을 잘라 1024×1024로 만든 일반 기본 아이콘 3개 |
| `../<앱>-maskable-1024.png` | 현재 여름 원본 전체를 담은 마스킹용 기본 아이콘 3개 |
| `inventory.json` | 이름, 제작 revision, 계절 PNG 24개의 경로·SHA-256·바이트 수 |
| `font/OjjudaIconLettering-Regular.ttf` | 제작에 필요한 글자만 포함한 이름 변경 파생 글꼴 |
| `font/OFL.txt` | 원본 저작권 표시와 SIL Open Font License 1.1 전문 |

위 기본 PNG 6개도 새 여름 글자 디자인이다. 이전 입체 일러스트를 보관하는 파일이 아니다.

- [preview.png](preview.png): 가을 3개, 각 아이콘 384px. 시트 크기 1500×560.
- [seasonal-preview.png](seasonal-preview.png): 3행×8열, 각 아이콘 176px. 행은 아지트·공원·파장, 열은 위 색상표 순서. 시트 크기 1664×768.
- [readability-48-96.png](readability-48-96.png): 가을·크리스마스를 각각 48px와 96px로 비교. 시트 크기 800×330.

## 글꼴 출처와 라이선스

원본은 **Bagel Fat One Regular**다. [JAMO-TYPEFACE/BagelFat](https://github.com/JAMO-TYPEFACE/BagelFat)의 글꼴이며, 저작권 표시는 `Copyright 2022 The Bagel Fat Project Authors`다. 원본 메타데이터의 제작사는 JAMO, 디자이너는 Kyung-won Kim이다.

- 다운로드: [Google Fonts의 BagelFatOne-Regular.ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/bagelfatone/BagelFatOne-Regular.ttf), 2026-11-20.
- 원본 SHA-256: `9286944032c5a9b20ad70940105417beae14013e0b4f5fc292425afdc4330245`.
- 다운로드 URL은 `main`을 가리키며 commit으로 고정하지 않았다. 같은 원본인지 확인할 때는 위 해시를 사용한다.
- 포함한 파생 글꼴 SHA-256: `56f53efa07b04cf38ec672d790be1094fc15d5c9efb9fb280cf40805a2504f41`.

파생 글꼴에는 `아·지·트·공·원·파·장` 7개 한글과 공백을 남겼다. 패밀리 이름은 `Ojjuda Icon Lettering`, PostScript 이름은 `OjjudaIconLettering-Regular`로 바꾸고 원본 저작권·제작자·라이선스 정보를 보존했다. 파일 크기는 7,908바이트다. 일반 문장용 한글 글꼴이 아니다.

원본과 파생 글꼴 모두 [동봉한 SIL OFL 1.1](font/OFL.txt)을 따른다. 글꼴을 재배포할 때 저작권 표시와 OFL을 함께 유지하며, 글꼴 자체를 단독 판매하지 않는다. OFL의 조건은 글꼴을 사용해 만든 이미지에 같은 라이선스를 강제하지 않는다. 제작 SVG는 글자를 윤곽선으로, 배포 PNG는 픽셀로 담으므로 사용자 기기에서 이 글꼴을 설치하거나 내려받을 필요가 없다.

## 재생성

포함된 파생 TTF를 처음부터 재구성할 때는 `python3 ops/prepare-wordmark-font.py`를 실행한다. 이 선택적 준비 명령은 공식 원본을 받아 SHA-256을 검사하고, 저작권·라이선스 메타데이터를 보존한 채 글자를 추려 이름을 바꾼다. 재생성에는 fontTools 4.61.1을 사용하며 결과 해시도 검사한다. 원본 또는 도구가 바뀌어 예상 해시와 다르면 파일을 쓰기 전에 중단한다. 일반적인 이미지 재생성에는 이미 포함된 TTF를 사용하므로 이 다운로드 단계가 필요 없다.

Python 3, Pillow, fontTools, Inkscape가 필요하다. 원본 제작 환경은 Inkscape 1.4, Pillow 13.0.0, fontTools 4.61.1이다. 저장소에 포함된 파생 TTF를 사용하며 실행 중 원본 글꼴을 다운로드하지 않는다. 저장소 루트에서 실행한다.

```bash
python3 ops/render-wordmark-app-icons.py
```

이 명령은 SVG 24개를 만든 뒤 Inkscape로 PNG를 렌더링한다. 각 PNG가 불투명 1024×1024인지 검사하고 RGB로 저장한다. 이어 여름 기본 PNG 6개, `inventory.json`, 미리보기 3개를 갱신한다. 폰트의 추가 자르기·이름 변경은 이 스크립트에서 수행하지 않는다. 입력은 이미 준비된 `OjjudaIconLettering-Regular.ttf`다.

기존 계절 PNG로 미리보기만 다시 만들려면 다음을 사용한다. 이 경우 Inkscape 렌더링과 원본·해시 목록 갱신은 실행하지 않는다.

```bash
python3 ops/render-wordmark-app-icons.py --previews-only
```

웹에 배포할 192·512·180px PNG와 manifest의 아이콘 revision은 `ops/build-seasonal-app-icons.mjs`가 만든다. Android 리소스는 `ops/android-apps/scripts/prepare_resources.py`가 같은 계절 PNG에서 만든다. 제작 스크립트만 실행했다고 웹 배포나 Android 앱 업데이트가 완료되는 것은 아니다. 배포·검증 절차는 [운영 안내](../../../ops/SEASONAL-APP-ICONS.md)를 따른다.

날짜 선택은 [기존 달력 규칙](../../../docs/app-icon-calendar.md)을 유지한다. 행사는 본날 D-7부터 시작하며 크리스마스는 12월 18~25일, 새해는 12월 25일~1월 1일, 설·추석은 D-7~D+1이다. 12월 25일은 크리스마스가 우선한다. manifest의 URL·`id`·`start_url`·`scope`와 앱 이름도 유지한다.

새 Android 빌드·검증 상태는 해당 변경 커밋의 Android Actions 결과로 확인한다. 이전 일러스트 빌드의 성공을 새 원본 검증으로 사용하지 않는다. 새 AAB의 서명·배포 상태도 별도로 확인한다.
