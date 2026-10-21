import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.makedirs('output/avatars/svg', exist_ok=True)

# ----------------- Theme Definitions -----------------
BG_DARK = (61, 80, 74)           # #3D504A Charcoal Eucalyptus
BG_SECONDARY = (70, 91, 84)      # #465B54
SURFACE_CARD = (75, 97, 89)      # #4B6159 Surface
SURFACE_DEEP = (49, 68, 62)      # #31443E SurfaceDeep
BORDER_COLOR = (146, 167, 158, 140)  # #92A79E ~55%
BORDER_STRONG = (178, 195, 186, 180) # #B2C3BA ~70%

TEXT_PRIMARY = (255, 243, 229)   # #FFF3E5 Warm Cream
TEXT_SECONDARY = (231, 218, 206) # #E7DACE Linen
TEXT_TERTIARY = (200, 215, 207)  # #C8D7CF
TEXT_DARK = (36, 49, 41)         # #243129 ButtonText / Deep Slate
ACCENT_CREAM = (249, 226, 205)   # #F9E2CD Accent Cream

STROKE_COLOR = (49, 68, 62)      # #31443E SurfaceDeep

FONT_PATH_HN = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_SERIF = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
FONT_MONO = '/System/Library/Fonts/SFNSMono.ttf'

def get_font(size, bold=True):
    # index 1 = Bold, index 0 = Regular
    return ImageFont.truetype(FONT_PATH_HN, size, index=1 if bold else 0)

AVATARS = [
    # Orange Spectrum
    {
        "id": "orange_tangerine",
        "name": "Tangerine",
        "tag": "Cover Original ('M')",
        "hex": "#FFA84D",
        "rgb": (255, 168, 77),
        "initial": "M",
        "dark_text": True
    },
    {
        "id": "orange_sunset",
        "name": "Sunset Orange",
        "tag": "Vibrant",
        "hex": "#F27A24",
        "rgb": (242, 122, 36),
        "initial": "O",
        "dark_text": True
    },
    {
        "id": "orange_peach",
        "name": "Warm Peach",
        "tag": "Soft Pastel",
        "hex": "#FFB87A",
        "rgb": (255, 184, 122),
        "initial": "P",
        "dark_text": True
    },
    {
        "id": "orange_amber",
        "name": "Golden Amber",
        "tag": "Warm Accent",
        "hex": "#F5A623",
        "rgb": (245, 166, 35),
        "initial": "A",
        "dark_text": True
    },
    {
        "id": "orange_terracotta",
        "name": "Terracotta",
        "tag": "Earth Tone",
        "hex": "#D95F2B",
        "rgb": (217, 95, 43),
        "initial": "R",
        "dark_text": False  # Cream text for contrast
    },

    # Green Spectrum
    {
        "id": "green_seafoam",
        "name": "Mint Seafoam",
        "tag": "Cover Original ('J')",
        "hex": "#6BE0AB",
        "rgb": (107, 224, 171),
        "initial": "J",
        "dark_text": True
    },
    {
        "id": "green_spring",
        "name": "Spring Leaf",
        "tag": "Bright Mint",
        "hex": "#9ED3AB",
        "rgb": (158, 211, 171),
        "initial": "L",
        "dark_text": True
    },
    {
        "id": "green_sage",
        "name": "Muted Sage",
        "tag": "Eucalyptus Soft",
        "hex": "#8FB89B",
        "rgb": (143, 184, 155),
        "initial": "S",
        "dark_text": True
    },
    {
        "id": "green_emerald",
        "name": "Emerald Mint",
        "tag": "Deep Vibrance",
        "hex": "#38B47C",
        "rgb": (56, 180, 124),
        "initial": "E",
        "dark_text": True
    },
    {
        "id": "green_forest",
        "name": "Forest Pine",
        "tag": "Brand Match",
        "hex": "#53755B",
        "rgb": (83, 117, 91),
        "initial": "G",
        "dark_text": False  # Cream text for contrast
    },
]

# ----------------- Single Avatar Generator -----------------
def generate_avatar(rgb, initial, dark_text=True, size=512, stroke_ratio=0.035, font_ratio=0.40, mode='initial'):
    scale = 4
    canvas_size = size * scale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(4 * scale)
    circle_box = [pad, pad, canvas_size - pad, canvas_size - pad]
    stroke_w = int(size * stroke_ratio * scale)

    # Background disc
    draw.ellipse(circle_box, fill=rgb)

    text_color = TEXT_DARK if dark_text else TEXT_PRIMARY

    if mode == 'initial':
        f_size = int(size * font_ratio * scale)
        font = get_font(f_size, bold=True)
        bbox = draw.textbbox((0, 0), initial, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        # Exact optical center
        tx = (canvas_size - text_w) / 2 - bbox[0]
        ty = (canvas_size - text_h) / 2 - bbox[1]
        draw.text((tx, ty), initial, font=font, fill=text_color)
    elif mode == 'silhouette':
        # Masked to inner disc
        mask = Image.new('L', (canvas_size, canvas_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        inner_pad = pad + stroke_w // 2
        mask_draw.ellipse([inner_pad, inner_pad, canvas_size - inner_pad, canvas_size - inner_pad], fill=255)

        sil_layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        sil_draw = ImageDraw.Draw(sil_layer)

        cx, cy = canvas_size / 2, canvas_size / 2
        head_r = canvas_size * 0.165
        head_y = cy - canvas_size * 0.08
        sil_draw.ellipse([cx - head_r, head_y - head_r, cx + head_r, head_y + head_r], fill=text_color)

        bust_w = canvas_size * 0.45
        bust_h = canvas_size * 0.35
        bust_top = head_y + head_r + canvas_size * 0.06
        sil_draw.chord([cx - bust_w, bust_top, cx + bust_w, bust_top + bust_h * 2], start=180, end=360, fill=text_color)

        # Apply mask
        sil_layer.putalpha(Image.composite(sil_layer.split()[-1], Image.new('L', sil_layer.size, 0), mask))
        img = Image.alpha_composite(img, sil_layer)
        draw = ImageDraw.Draw(img)

    # Stroke overlay
    draw.ellipse(circle_box, outline=STROKE_COLOR, width=stroke_w)

    return img.resize((size, size), Image.Resampling.LANCZOS)

# Generate individual PNGs and SVGs
for av in AVATARS:
    # Initial PNG
    av_img = generate_avatar(av['rgb'], av['initial'], av['dark_text'], size=512, mode='initial')
    av_img.save(f"output/avatars/avatar_{av['id']}.png")

    # Silhouette PNG
    av_sil = generate_avatar(av['rgb'], av['initial'], av['dark_text'], size=512, mode='silhouette')
    av_sil.save(f"output/avatars/avatar_{av['id']}_silhouette.png")

    # Scalable SVG
    tc_hex = "#243129" if av['dark_text'] else "#FFF3E5"
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="246" fill="{av['hex']}" stroke="#31443E" stroke-width="18"/>
  <text x="256" y="306" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="205" font-weight="bold" fill="{tc_hex}" text-anchor="middle">{av['initial']}</text>
</svg>'''
    with open(f"output/avatars/svg/avatar_{av['id']}.svg", "w") as f:
        f.write(svg_content)

# ----------------- Focused Overlapping Cluster Image -----------------
def generate_cluster_image():
    W, H = 1440, 480
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    card_margin = 24
    card = Image.new('RGBA', (W - card_margin*2, H - card_margin*2), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)

    cw, ch = card.size
    cdraw.rounded_rectangle([0, 0, cw, ch], radius=38, fill=(75, 97, 89, 235), outline=BORDER_COLOR, width=2)

    cluster_palette = [
        {"rgb": (228, 205, 181), "init": "S", "dark": True},  # AccentStrong (Cover S)
        {"rgb": (255, 168, 77), "init": "M", "dark": True},   # Tangerine Orange (Cover M)
        {"rgb": (107, 224, 171), "init": "J", "dark": True},  # Mint Seafoam (Cover J)
        {"rgb": (242, 122, 36), "init": "O", "dark": True},   # Sunset Orange
        {"rgb": (143, 184, 155), "init": "S", "dark": True},  # Soft Sage
        {"rgb": (255, 184, 122), "init": "P", "dark": True},  # Warm Peach
        {"rgb": (56, 180, 124), "init": "E", "dark": True},   # Emerald Mint
    ]

    av_size = 140
    overlap_step = 95
    start_x = 75
    start_y = (ch - av_size) // 2

    for i, item in enumerate(cluster_palette):
        av_icon = generate_avatar(item['rgb'], item['init'], item['dark'], size=av_size, stroke_ratio=0.038)

        # Soft shadow behind each disc
        shadow = Image.new('RGBA', (av_size + 24, av_size + 24), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.ellipse([10, 10, av_size + 10, av_size + 10], fill=(0, 0, 0, 80))
        shadow = shadow.filter(ImageFilter.GaussianBlur(8))

        card.alpha_composite(shadow, (start_x + i * overlap_step - 5, start_y - 2))
        card.alpha_composite(av_icon, (start_x + i * overlap_step, start_y))

    text_x = start_x + len(cluster_palette) * overlap_step + 75
    f_title = get_font(34, bold=True)
    f_sub = get_font(23, bold=False)

    cdraw.text((text_x, start_y + 26), "Built for the group", font=f_title, fill=TEXT_PRIMARY)
    cdraw.text((text_x, start_y + 76), "One search. Every tradeoff visible.", font=f_sub, fill=TEXT_SECONDARY)

    img.alpha_composite(card, (card_margin, card_margin))
    img.save("output/avatars/homeboard-avatars-cluster.png")

generate_cluster_image()

# ----------------- Master Showcase Presentation Image -----------------
def generate_master_showcase():
    W, H = 2200, 1520
    img = Image.new('RGB', (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Ambient gradient
    for y in range(H):
        ratio = y / H
        r = int(BG_DARK[0] + (BG_SECONDARY[0] - BG_DARK[0]) * ratio * 0.45)
        g = int(BG_DARK[1] + (BG_SECONDARY[1] - BG_DARK[1]) * ratio * 0.45)
        b = int(BG_DARK[2] + (BG_SECONDARY[2] - BG_DARK[2]) * ratio * 0.45)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    f_hero_sub = get_font(20, bold=True)
    f_hero_title = ImageFont.truetype(FONT_SERIF, 48)
    f_sec_title = get_font(24, bold=True)
    f_item_name = get_font(22, bold=True)
    f_item_hex = ImageFont.truetype(FONT_MONO, 18)
    f_item_tag = get_font(14, bold=False)

    # Header
    draw.text((80, 55), "HOMEBOARD  ·  DESIGN ASSETS", font=f_hero_sub, fill=ACCENT_CREAM)
    draw.text((80, 92), "Member Profile Avatars — Orange & Green", font=f_hero_title, fill=TEXT_PRIMARY)
    draw.rectangle([80, 162, 180, 166], fill=ACCENT_CREAM)

    # ---------------- Top Banner: Live App Cover Comparison ----------------
    top_card_box = [80, 190, W - 80, 425]
    draw.rounded_rectangle(top_card_box, radius=28, fill=SURFACE_CARD, outline=BORDER_STRONG, width=2)

    preview_palette = [
        {"rgb": (228, 205, 181), "init": "S", "dark": True},
        {"rgb": (255, 168, 77), "init": "M", "dark": True},
        {"rgb": (107, 224, 171), "init": "J", "dark": True},
        {"rgb": (242, 122, 36), "init": "O", "dark": True},
        {"rgb": (143, 184, 155), "init": "S", "dark": True},
        {"rgb": (255, 184, 122), "init": "P", "dark": True},
        {"rgb": (56, 180, 124), "init": "E", "dark": True},
        {"rgb": (83, 117, 91), "init": "G", "dark": False},
    ]

    stack_x = 120
    stack_y = 230
    av_size = 120
    overlap = 78

    for i, item in enumerate(preview_palette):
        av_img = generate_avatar(item['rgb'], item['init'], item['dark'], size=av_size, stroke_ratio=0.038)

        shadow = Image.new('RGBA', (av_size + 20, av_size + 20), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.ellipse([8, 8, av_size + 8, av_size + 8], fill=(0, 0, 0, 70))
        shadow = shadow.filter(ImageFilter.GaussianBlur(6))

        img.paste(shadow, (stack_x + i * overlap - 4, stack_y - 2), shadow)
        img.paste(av_img, (stack_x + i * overlap, stack_y), av_img)

    info_x = stack_x + len(preview_palette) * overlap + 70
    draw.text((info_x, stack_y + 12), "Built for the group", font=get_font(30, bold=True), fill=TEXT_PRIMARY)
    draw.text((info_x, stack_y + 54), "One search. Every tradeoff visible.", font=get_font(20, bold=False), fill=TEXT_SECONDARY)
    draw.text((info_x, stack_y + 90), "As seen on the cover of the Homeboard iOS app", font=get_font(16, bold=False), fill=ACCENT_CREAM)

    # ---------------- Grid Section: Orange Row ----------------
    draw.text((80, 465), "ORANGE SPECTRUM", font=f_sec_title, fill=ACCENT_CREAM)
    draw.rectangle([80, 502, W - 80, 504], fill=BORDER_COLOR)

    oranges = [av for av in AVATARS if av['id'].startswith('orange')]
    card_w = (W - 160 - (len(oranges) - 1) * 24) // len(oranges)

    for i, item in enumerate(oranges):
        cx = 80 + i * (card_w + 24)
        cy = 525
        card_h = 390
        draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=22, fill=SURFACE_CARD, outline=BORDER_COLOR, width=1)

        # Avatar disc
        av_img = generate_avatar(item['rgb'], item['initial'], item['dark_text'], size=130, stroke_ratio=0.038)
        img.paste(av_img, (cx + (card_w - 130) // 2, cy + 30), av_img)

        # Silhouette mini badge
        sil_img = generate_avatar(item['rgb'], item['initial'], item['dark_text'], size=56, stroke_ratio=0.038, mode='silhouette')
        img.paste(sil_img, (cx + card_w - 74, cy + 18), sil_img)

        # Name
        bbox = draw.textbbox((0, 0), item['name'], font=f_item_name)
        nw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - nw) // 2, cy + 185), item['name'], font=f_item_name, fill=TEXT_PRIMARY)

        # Hex
        bbox = draw.textbbox((0, 0), item['hex'], font=f_item_hex)
        hw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - hw) // 2, cy + 225), item['hex'], font=f_item_hex, fill=ACCENT_CREAM)

        # Tag badge
        bbox = draw.textbbox((0, 0), item['tag'], font=f_item_tag)
        tw = bbox[2] - bbox[0]
        tag_bg = [cx + (card_w - tw) // 2 - 12, cy + 270, cx + (card_w + tw) // 2 + 12, cy + 300]
        draw.rounded_rectangle(tag_bg, radius=10, fill=SURFACE_DEEP, outline=BORDER_COLOR, width=1)
        draw.text((cx + (card_w - tw) // 2, cy + 276), item['tag'], font=f_item_tag, fill=TEXT_SECONDARY)

        # Initial callout
        init_str = f"Initial: \"{item['initial']}\""
        bbox = draw.textbbox((0, 0), init_str, font=f_item_tag)
        iw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - iw) // 2, cy + 325), init_str, font=f_item_tag, fill=TEXT_TERTIARY)

    # ---------------- Grid Section: Green Row ----------------
    draw.text((80, 960), "GREEN SPECTRUM", font=f_sec_title, fill=ACCENT_CREAM)
    draw.rectangle([80, 997, W - 80, 999], fill=BORDER_COLOR)

    greens = [av for av in AVATARS if av['id'].startswith('green')]

    for i, item in enumerate(greens):
        cx = 80 + i * (card_w + 24)
        cy = 1020
        card_h = 390
        draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=22, fill=SURFACE_CARD, outline=BORDER_COLOR, width=1)

        # Avatar disc
        av_img = generate_avatar(item['rgb'], item['initial'], item['dark_text'], size=130, stroke_ratio=0.038)
        img.paste(av_img, (cx + (card_w - 130) // 2, cy + 30), av_img)

        # Silhouette mini badge
        sil_img = generate_avatar(item['rgb'], item['initial'], item['dark_text'], size=56, stroke_ratio=0.038, mode='silhouette')
        img.paste(sil_img, (cx + card_w - 74, cy + 18), sil_img)

        # Name
        bbox = draw.textbbox((0, 0), item['name'], font=f_item_name)
        nw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - nw) // 2, cy + 185), item['name'], font=f_item_name, fill=TEXT_PRIMARY)

        # Hex
        bbox = draw.textbbox((0, 0), item['hex'], font=f_item_hex)
        hw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - hw) // 2, cy + 225), item['hex'], font=f_item_hex, fill=ACCENT_CREAM)

        # Tag badge
        bbox = draw.textbbox((0, 0), item['tag'], font=f_item_tag)
        tw = bbox[2] - bbox[0]
        tag_bg = [cx + (card_w - tw) // 2 - 12, cy + 270, cx + (card_w + tw) // 2 + 12, cy + 300]
        draw.rounded_rectangle(tag_bg, radius=10, fill=SURFACE_DEEP, outline=BORDER_COLOR, width=1)
        draw.text((cx + (card_w - tw) // 2, cy + 276), item['tag'], font=f_item_tag, fill=TEXT_SECONDARY)

        # Initial callout
        init_str = f"Initial: \"{item['initial']}\""
        bbox = draw.textbbox((0, 0), init_str, font=f_item_tag)
        iw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - iw) // 2, cy + 325), init_str, font=f_item_tag, fill=TEXT_TERTIARY)

    img.save("output/avatars/homeboard-profile-pictures-showcase.png")
    print("Master showcase image updated successfully.")

generate_master_showcase()
