from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "custom" / "generated_furniture"
SPRITE_SIZE = 256
PADDING = 8
V1_NAMES = [
    "generated_bed",
    "generated_sofa",
    "generated_stove",
    "generated_fridge",
    "generated_toilet",
    "generated_shower",
    "generated_indoor_tree",
    "generated_potted_flower",
    "generated_computer_desk",
    "generated_arcade",
    "generated_treadmill",
    "generated_fountain",
    "generated_crib",
    "generated_workbench",
    "generated_telescope",
    "generated_hot_tub",
]
V2_NAMES = [
    "generated_kitchen_sink",
    "generated_microwave",
    "generated_espresso",
    "generated_dishwasher",
    "generated_bathroom_vanity",
    "generated_flat_tv",
    "generated_stereo",
    "generated_game_console",
    "generated_aquarium",
    "generated_standing_mirror",
    "generated_bbq_grill",
    "generated_weight_bench",
    "generated_changing_table",
    "generated_3d_printer",
    "generated_fireplace",
    "generated_vanity",
]
SHEETS = [
    (ROOT / "assets" / "custom" / "generated-furniture-sheet-alpha-v1.png", V1_NAMES),
    (ROOT / "assets" / "custom" / "generated-furniture-sheet-alpha-v2.png", V2_NAMES),
]


def remove_sheet_edge_fragments(cell: Image.Image) -> Image.Image:
    """Drop disconnected bleed from neighboring cells without touching the main sprite."""
    alpha = cell.getchannel("A")
    width, height = cell.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components = []

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if visited[index] or pixels[start_x, start_y] <= 10:
                continue

            queue = deque([(start_x, start_y)])
            visited[index] = 1
            component = []
            touches_edge = False
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                touches_edge = touches_edge or x <= 1 or y <= 1 or x >= width - 2 or y >= height - 2
                for next_y in range(max(0, y - 1), min(height, y + 2)):
                    for next_x in range(max(0, x - 1), min(width, x + 2)):
                        next_index = next_y * width + next_x
                        if visited[next_index] or pixels[next_x, next_y] <= 10:
                            continue
                        visited[next_index] = 1
                        queue.append((next_x, next_y))
            components.append((component, touches_edge))

    if not components:
        return cell

    largest_size = max(len(component) for component, _ in components)
    cleaned = cell.copy()
    cleaned_pixels = cleaned.load()
    for component, touches_edge in components:
        is_small_speck = len(component) < max(12, largest_size * 0.001)
        if not touches_edge and not is_small_speck:
            continue
        if len(component) == largest_size:
            continue
        for x, y in component:
            cleaned_pixels[x, y] = (0, 0, 0, 0)
    return cleaned


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = []

    for source, names in SHEETS:
        sheet = Image.open(source).convert("RGBA")
        for index, name in enumerate(names):
            row, column = divmod(index, 4)
            left = round(column * sheet.width / 4)
            right = round((column + 1) * sheet.width / 4)
            top = round(row * sheet.height / 4)
            bottom = round((row + 1) * sheet.height / 4)
            cell = remove_sheet_edge_fragments(sheet.crop((left, top, right, bottom)))
            alpha = cell.getchannel("A")
            bounds = alpha.point(lambda value: 255 if value > 10 else 0).getbbox()
            if bounds is None:
                raise RuntimeError(f"No opaque pixels found for {name}")

            crop = cell.crop(bounds)
            available = SPRITE_SIZE - PADDING * 2
            scale = min(1.0, available / crop.width, available / crop.height)
            target = (
                max(1, round(crop.width * scale)),
                max(1, round(crop.height * scale)),
            )
            if crop.size != target:
                crop = crop.resize(target, Image.Resampling.NEAREST)

            canvas = Image.new("RGBA", (SPRITE_SIZE, SPRITE_SIZE), (0, 0, 0, 0))
            x = (SPRITE_SIZE - crop.width) // 2
            y = SPRITE_SIZE - PADDING - crop.height
            canvas.alpha_composite(crop, (x, y))
            output_path = OUTPUT / f"{name}.png"
            canvas.save(output_path, optimize=True)

            alpha_out = canvas.getchannel("A")
            opaque_bounds = alpha_out.point(lambda value: 255 if value > 10 else 0).getbbox()
            manifest.append({
                "key": name,
                "file": output_path.relative_to(ROOT).as_posix(),
                "sourceSheet": source.name,
                "sourceCell": index + 1,
                "sourceBounds": list(bounds),
                "outputBounds": list(opaque_bounds or (0, 0, 0, 0)),
            })

    manifest_path = OUTPUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="ascii")
    print(f"Extracted {len(manifest)} furniture sprites to {OUTPUT}")


if __name__ == "__main__":
    main()
