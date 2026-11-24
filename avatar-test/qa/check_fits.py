"""Skip approved, unchanged avatar fits. Print the exact look and pose needing review."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = Path(__file__).with_name("approved-fits.json")


def source_hashes():
    assets = [p for p in ROOT.rglob("*") if p.is_file() and "qa" not in p.relative_to(ROOT).parts]
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(assets)}


def render(url, chromium, combinations, capture_dir=None, all_items=False):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as runner:
        browser = runner.chromium.launch(executable_path=chromium, args=["--disable-gpu", "--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        if not url:
            def local(route):
                path = urlsplit(route.request.url).path
                if path == "/api/catalog":
                    return route.fulfill(json={"template": "female-r01", "items": []})
                if path.startswith("/avatar-test/"):
                    filename = (ROOT / (path[len("/avatar-test/"):] or "index.html")).resolve()
                    if filename.is_relative_to(ROOT) and filename.is_file():
                        return route.fulfill(path=filename)
                return route.fulfill(status=404, body="")
            page.route("**/*", local)
        page.goto(url or "https://avatar.test/avatar-test/")
        page.wait_for_selector("#studio:not([inert]) #looks button")
        buttons = page.locator("#looks button")
        names = buttons.all_text_contents()
        if not names or len(names) != len(set(names)):
            raise RuntimeError("코디 이름이 비어 있거나 중복되어 구분할 수 없습니다.")
        page.evaluate("""() => {
          window.fitDrawCount = 0;
          new MutationObserver(() => window.fitDrawCount++)
            .observe(document.querySelector('#poseLabel'), {childList:true});
        }""")
        def click_and_wait(button):
            before = page.evaluate("window.fitDrawCount")
            button.click()
            page.wait_for_function("n => window.fitDrawCount > n", arg=before)

        def select_category(label):
            page.locator("#cats button").filter(has_text=label).click()

        def apply_step(step):
            select_category(step["category"])
            if "item" in step:
                click_and_wait(page.locator("#items").get_by_role("button", name=step["item"], exact=True))
            if "color" in step:
                click_and_wait(page.locator("#wardrobeColors").get_by_role("button", name=step["color"], exact=True))

        def catalog_cases():
            # Discover the actual UI catalogue, including every displayed color.
            baseline = "로즈 클래식"
            excluded = {("하의", "클래식 플리츠 스커트"), ("신발", "버클 앵클부츠")}
            inventory = {}
            for button in page.locator("#cats button").all_text_contents():
                category = button.rsplit(" ", 1)[0]
                if category == "배경":
                    continue
                click_and_wait(page.locator("#looks").get_by_role("button", name=baseline, exact=True))
                select_category(category)
                names = page.locator("#items button").evaluate_all(
                    "(buttons) => buttons.map(b => b.getAttribute('aria-label'))")
                if None in names or len(names) != len(set(names)):
                    raise RuntimeError(f"아이템 이름을 구분할 수 없습니다: {category}")
                options = []
                for name in names:
                    if (category, name) in excluded:
                        continue
                    select_category(category)
                    click_and_wait(page.locator("#items").get_by_role("button", name=name, exact=True))
                    colors = page.locator("#wardrobeColors button").all_text_contents()
                    if len(colors) != len(set(colors)):
                        raise RuntimeError(f"색상 이름이 중복됩니다: {category} / {name}")
                    for color in colors or [None]:
                        step = {"category": category, "item": name}
                        if color is not None:
                            step["color"] = color.strip()
                        options.append(step)
                inventory[category] = options
            if not inventory.get("헤어") or not any(
                step["item"] == "골지 니트" for step in inventory.get("상의", [])
            ):
                raise RuntimeError("골지 니트 또는 헤어 검사 목록이 비어 있습니다.")

            def key(step):
                return step["category"] + "/" + step["item"] + (
                    "/" + step["color"] if "color" in step else "")

            cases = []
            for options in inventory.values():
                for step in options:
                    cases.append(("전수/ " + key(step), baseline, [step]))
            # A top or dress that looks correct with one hair can expose a hole
            # with another. Check the full cross-product, including no hair.
            for category in ("상의", "원피스"):
                for garment in inventory.get(category, []):
                    if garment["item"] == "장착 안 함":
                        continue
                    for hair in inventory["헤어"]:
                        cases.append(("헤어교차/ " + key(garment) + " + " + key(hair),
                                      baseline, [garment, hair]))
            return cases

        result = {}
        captures = []
        if capture_dir:
            capture_dir.mkdir(parents=True, exist_ok=True)
        cases = [(name, name, []) for name in names]
        for name, recipe in combinations.items():
            if name in names:
                raise RuntimeError(f"추가 조합 이름이 추천 코디와 겹칩니다: {name}")
            cases.append((name, recipe["look"], recipe["steps"]))
        if all_items:
            cases.extend(catalog_cases())
        for name, base, steps in cases:
            click_and_wait(page.locator("#looks").get_by_role("button", name=base, exact=True))
            for step in steps:
                apply_step(step)
            result[name] = page.evaluate("""async () => {
              const poses = [...document.querySelectorAll('#poses button')].map(button =>
                [button.textContent.trim(), button.querySelector('canvas')]);
              poses.push(['미니미', document.querySelector('#mini')]);
              if (poses.length < 2 || new Set(poses.map(([name]) => name)).size !== poses.length)
                throw Error('포즈 목록을 구분할 수 없습니다.');
              const entries = [];
              for (const [name, canvas] of poses) {
                if (!canvas || canvas.width !== 400 || canvas.height !== 656)
                  throw Error('원본 캔버스 크기가 달라졌습니다.');
                const pixels = canvas.getContext('2d').getImageData(0,0,400,656).data;
                let opaque = 0;
                for (let i=3; i<pixels.length; i+=4) if (pixels[i] >= 128) opaque++;
                if (opaque < 8000) throw Error('아바타 원화가 비어 있습니다.');
                const digest = await crypto.subtle.digest('SHA-256', pixels);
                entries.push([name, Array.from(new Uint8Array(digest),
                  b => b.toString(16).padStart(2,'0')).join('')]);
              }
              return Object.fromEntries(entries);
            }""")
            if capture_dir:
                images = page.evaluate("""() => {
                  const views = [...document.querySelectorAll('#poses button')].map(b =>
                    [b.textContent.trim(), b.querySelector('canvas')]);
                  views.push(['미니미', document.querySelector('#mini')]);
                  return views.map(([pose, canvas]) => {
                    const zoom = document.createElement('canvas');
                    zoom.width = canvas.width * 4;
                    zoom.height = canvas.height * 4;
                    const ctx = zoom.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(canvas, 0, 0, zoom.width, zoom.height);
                    return [pose, canvas.toDataURL('image/png'), zoom.toDataURL('image/png')];
                  });
                }""")
                for pose, original, enlarged in images:
                    key = f'{len(captures)+1:03d}'
                    filenames = [f'{key}-original.png', f'{key}-4x.png']
                    for filename, data in zip(filenames, (original, enlarged)):
                        (capture_dir / filename).write_bytes(base64.b64decode(data.split(',', 1)[1], validate=True))
                    captures.append({'look': name, 'pose': pose, 'original': filenames[0], 'enlarged': filenames[1]})
        if capture_dir:
            (capture_dir / 'index.json').write_text(json.dumps(captures, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if errors:
            raise RuntimeError("\n".join(errors))
        browser.close()
        return result


def compare(current, approved):
    pending = {}
    skipped = 0
    for look, poses in current.items():
        for pose, checksum in poses.items():
            if approved.get(look, {}).get(pose) == checksum:
                skipped += 1
            else:
                pending.setdefault(look, {})[pose] = checksum
    for look, poses in approved.items():
        for pose in poses:
            if pose not in current.get(look, {}):
                pending.setdefault(look, {})[pose] = "missing"
    return skipped, pending


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="실제 테스트 페이지에서 검사 (추가 카탈로그 포함)")
    parser.add_argument("--render", action="store_true", help="소스가 같아도 픽셀 지문 확인")
    parser.add_argument("--chromium", help="설치된 Chromium 실행 파일")
    parser.add_argument("--cases", type=Path, help="추가로 검사할 착용 조합 JSON")
    parser.add_argument("--all-items", action="store_true", help="두 제외 디자인 외 모든 아이템·색상 및 상의/원피스와 헤어 교차 검사")
    parser.add_argument("--capture-dir", type=Path, help="실제 원본 PNG 및 보간 없는 4배 확대 PNG 저장")
    parser.add_argument("--report", type=Path, help="재검사 대상과 현재 픽셀 지문을 JSON으로 저장")
    args = parser.parse_args()
    if args.report and args.report.resolve() == REGISTRY:
        parser.error("검사 결과로 승인 목록을 덮어쓸 수 없습니다.")
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    approved = registry["approved"]
    combinations = registry["combinations"].copy()
    if args.cases:
        extra = json.loads(args.cases.read_text(encoding="utf-8"))
        if combinations.keys() & extra.keys():
            parser.error("추가 검사 조합의 이름이 등록된 조합과 겹칩니다.")
        combinations.update(extra)
    if (not args.url and not args.render and not args.cases and not args.capture_dir and not args.all_items and registry["completeSnapshot"]
            and source_hashes() == registry["sources"]):
        skipped = sum(len(poses) for poses in approved.values())
        pending = {}
    else:
        skipped, pending = compare(render(args.url, args.chromium, combinations, args.capture_dir, args.all_items), approved)
    print(f"재검사 제외 {skipped}건 · 확인 필요 {sum(map(len, pending.values()))}건")
    for look, poses in pending.items():
        print(f"{look} — {', '.join(poses)}")
    if args.report:
        args.report.write_text(json.dumps(pending, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return bool(pending)


if __name__ == "__main__":
    raise SystemExit(main())
