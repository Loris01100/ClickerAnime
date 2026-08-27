"""Extract the five transparent node icons from each generated branch sheet."""

from pathlib import Path
from PIL import Image


SHEETS = {
    "narrator-click": "exec-f59077be-6590-4afd-be1d-7068c41c9f0f.png",
    "team-dps": "exec-ee71dbe1-a7bb-4cdc-8f30-be216720ad16.png",
    "xp": "exec-e7dc854c-ff34-46fa-9ee8-2a7afd475ccb.png",
    "items": "exec-b122c568-e0fa-4d1a-ad82-352b77699b99.png",
    "destin": "exec-2d6726f9-41a8-4a78-9657-1dab0bb6966d.png",
    "automation": "exec-d0fafae5-b7ff-419b-87c9-f59cb31d2b9a.png",
}

SOURCE = Path.home() / ".codex/generated_images/01a03eb1-cdbf-7fd0-963b-a8de9ee5adce"
TARGET = Path(__file__).parents[1] / "public/prestige-nodes"


def extract(sheet_path: Path, prefix: str) -> None:
    sheet = Image.open(sheet_path).convert("RGBA")
    TARGET.mkdir(parents=True, exist_ok=True)

    for index in range(5):
        left = round(index * sheet.width / 5)
        right = round((index + 1) * sheet.width / 5)
        cell = sheet.crop((left, 0, right, sheet.height))
        alpha_box = cell.getchannel("A").getbbox()
        if alpha_box:
            cell = cell.crop(alpha_box)

        side = max(cell.width, cell.height)
        padding = max(10, round(side * 0.06))
        canvas = Image.new("RGBA", (side + padding * 2, side + padding * 2))
        canvas.alpha_composite(cell, ((canvas.width - cell.width) // 2, (canvas.height - cell.height) // 2))
        canvas.thumbnail((256, 256), Image.Resampling.LANCZOS)
        canvas.save(TARGET / f"{prefix}-{index + 1}.webp", "WEBP", quality=90, method=4)


for branch, filename in SHEETS.items():
    extract(SOURCE / filename, branch)
