"""Stage the pinned single-thread Fairy-Stockfish build, network and matching sources."""
import hashlib
from pathlib import Path
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

COMMIT = "7cdcc3348f76d9126397f84b11fd92ee956ac11e"
BASE = f"https://raw.githubusercontent.com/junovale99/janggi/{COMMIT}/"
ENGINE = "public/games/janggi/fairy-stockfish-4d4b393/"
NETWORK = "public/games/janggi/nnue-9991472750de/"
SOURCE = "third_party/fairy-stockfish/4d4b393/"

FILES = [
    (ENGINE, "engine-worker.js", "ec672a5ac137bf0ef773b6cdab13d890b69ae90a7bff340a17213c4b5093df84"),
    (ENGINE, "stockfish.js", "276b79f09560c18d27b806fb0ebad4a30c97d83421dbb09f40ea7b85df8314fd"),
    (ENGINE, "stockfish.wasm", "a24d4e02f64bf8126eef89d03feea4c51e24befb7cd1c48916894e05cc8c6f00"),
    (NETWORK, "janggi-9991472750de.nnue", "9991472750deab2ce1723b9d4040577bac9579b0a20457c4c86659fce03439e9"),
    (SOURCE, "AUTHORS", "55a0a4599358308af8349344d79176469f04119558e85595efe0a39b583cdf00"),
    (SOURCE, "Copying.txt", "0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b"),
    (SOURCE, "README.md", "39d9f462bd18c0ca44f4faea91569d0a8b9fb0e4ff31f55393a696cec8e2e6e1"),
    (SOURCE, "build-fairy.sh", "ffcbcb0f5c415ab334e38fa0b497ccccab51272df15b563f8731dcc98b638702"),
    (SOURCE, "fairy-single-thread.patch", "56a749f8c107a546b43bfda4042d9a7b36f2eef68be8211a17ff7168deec149d"),
    (SOURCE, "fairy-stockfish.wasm-4d4b393.tar.gz", "fa61f930e21d6d8a4ee611e024a605d9e6d2e2f16d8f24301b5631227b5c6829"),
    ("third_party/fairy-stockfish-nnue/", "README.md", "73d650b2972333cf6f21bbd3f1e67bf0d660d596d9e8a065a81f49187896eeec"),
]

def stage(root):
    target = root / "games/janggi/fairy-4d4b393-9991472750de"
    for directory, filename, digest in FILES:
        destination = target / ("network-notice.md" if directory.endswith("-nnue/") else filename)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == digest:
            continue
        for attempt in range(3):
            try:
                with urlopen(BASE + directory + filename, timeout=45) as source:
                    data = source.read()
                break
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Digest mismatch for {filename}")
        destination.write_bytes(data)

if __name__ == "__main__":
    stage(Path(sys.argv[1]))
