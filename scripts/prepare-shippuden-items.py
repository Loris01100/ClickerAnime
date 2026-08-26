"""Normalize generated Shippuden unique-item art to the project's 256px PNG format."""

from pathlib import Path
from PIL import Image


SOURCE = Path.home() / ".codex/generated_images/01a03eb1-cdbf-7fd0-963b-a8de9ee5adce"
TARGET = Path(__file__).parents[1] / "public/items"
FILES = {
    "item-argile": "exec-7d0e9fc9-2cb6-4538-a277-45b73c989b09.png",
    "item-fiole": "exec-fd7a7aeb-af1e-4a7e-8cc1-df0ceef8409a.png",
    "item-coeur": "exec-35e1d879-141e-4c32-b7dc-3d5b0ab2d372.png",
    "item-samehada": "exec-2ff13226-22ac-4c97-93ba-1f414aeb1b45.png",
    "item-message": "exec-59140cbb-01e4-4958-8c38-ab5cacebbe35.png",
    "item-susanoo": "exec-d6517494-cc0a-48fb-aece-bd019761e198.png",
    "item-barre": "exec-bc0f223c-7b22-4808-86df-f92ffc056584.png",
    "item-bras": "exec-6fc55235-75ed-4461-9cd7-44269af5ee41.png",
    "item-mue": "exec-b3356541-e34f-4419-be2f-62de58b4b219.png",
    "item-sceau-kage": "exec-4f55f158-2e63-4d37-a42a-0ed9217c4f66.png",
    "item-gunbai": "exec-45f7cd2f-f86b-4345-9894-b47cdad1dac0.png",
    "item-masque-spirale": "exec-fbf06742-e470-4ceb-b389-eb8f318f6330.png",
    "item-kotoamatsukami": "exec-8125d687-ac97-4ba7-81b1-f16c5a58e2d5.png",
    "item-fruit": "exec-8d26d921-2057-4fc4-902f-7e2895b8bf00.png",
    "item-tenseigan": "exec-b089980c-1666-4424-9038-7c0db4e9b4ba.png",
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

print(f"Wrote {len(FILES)} Shippuden item icons.")
