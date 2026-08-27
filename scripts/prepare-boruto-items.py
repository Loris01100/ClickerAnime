"""Normalize generated Boruto unique-item art to the project's 256px PNG format."""

from pathlib import Path
from PIL import Image


SOURCE = Path.home() / ".codex/generated_images/01a03eb1-cdbf-7fd0-963b-a8de9ee5adce"
TARGET = Path(__file__).parents[1] / "public/items"
FILES = {
    "item-sceau-nue": "exec-fbbebb08-9ede-4ad2-8b50-952a3dcc34a2.png",
    "item-fruit-chakra": "exec-661d5954-d875-461c-9df6-2035a3dde261.png",
    "item-noyau-akuta": "exec-7aab0eab-8c50-4668-b429-062fd7c3bbdd.png",
    "item-sept-lames": "exec-6a5889dd-f524-4fea-9caf-a4bf87c85eb8.png",
    "item-carbone-pur": "exec-4fb78835-fc5a-46b5-8684-8a8890130724.png",
    "item-bras-delta": "exec-40202c65-5c93-4a51-938d-3e6a6299fa8f.png",
    "item-regeneration-boro": "exec-e343cea7-e073-4e8c-a908-738d6a119cc3.png",
    "item-sceptre-isshiki": "exec-f16169f8-73f7-4bc7-9b5e-18aae55d1cbe.png",
}


for item_id, filename in FILES.items():
    image = Image.open(SOURCE / filename).convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box:
        image = image.crop(alpha_box)
    image.thumbnail((232, 232), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 256))
    canvas.alpha_composite(image, ((256 - image.width) // 2, (256 - image.height) // 2))
    canvas.save(TARGET / f"{item_id}.png", optimize=True)

print(f"Wrote {len(FILES)} Boruto item icons.")
