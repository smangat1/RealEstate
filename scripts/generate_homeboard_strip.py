import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.makedirs('output/avatars/svg', exist_ok=True)

FONT_PATH_HN = '/System/Library/Fonts/HelveticaNeue.ttc'
STROKE_COLOR = (49, 68, 62)  # #31443E SurfaceDeep
TEXT_DARK = (36, 49, 41)     # #243129 ButtonText
TEXT_LIGHT = (255, 243, 229) # #FFF3E5 PrimaryText

LETTERS_UPPER = [
    {"char": "H", "name": "Tangerine", "hex": "#FFA84D", "rgb": (255, 168, 77), "dark_text": True},
    {"char": "O", "name": "Mint Seafoam", "hex": "#6BE0AB", "rgb": (107, 224, 171), "dark_text": True},
    {"char": "M", "name": "Sunset Orange", "hex": "#F27A24", "rgb": (242, 122, 36), "dark_text": True},
    {"char": "E", "name": "Spring Leaf", "hex": "#9ED3AB", "rgb": (158, 211, 171), "dark_text": True},
    {"char": "B", "name": "Warm Peach", "hex": "#FFB87A", "rgb": (255, 184, 122), "dark_text": True},
    {"char": "O", "name": "Soft Sage", "hex": "#8FB89B", "rgb": (143, 184, 155), "dark_text": True},
    {"char": "A", "name": "Golden Amber", "hex": "#F5A623", "rgb": (245, 166, 35), "dark_text": True},
    {"char": "R", "name": "Emerald Mint", "hex": "#38B47C", "rgb": (56, 180, 124), "dark_text": True},
    {"char": "D", "name": "Terracotta", "hex": "#D95F2B", "rgb": (217, 95, 43), "dark_text": False},
]

def generate_avatar_disc(rgb, char, dark_text, size=280):
    scale = 4
    canvas_size = size * scale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(4 * scale)
    circle_box = [pad, pad, canvas_size - pad, canvas_size - pad]
    stroke_w = int(size * 0.038 * scale)

    draw.ellipse(circle_box, fill=rgb)

    # Text
    f_size = int(size * 0.40 * scale)
    font = ImageFont.truetype(FONT_PATH_HN, f_size, index=1)
    bbox = draw.textbbox((0, 0), char, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    tx = (canvas_size - text_w) / 2 - bbox[0]
    ty = (canvas_size - text_h) / 2 - bbox[1]

    text_color = TEXT_DARK if dark_text else TEXT_LIGHT
    draw.text((tx, ty), char, font=font, fill=text_color)

    # Border
    draw.ellipse(circle_box, outline=STROKE_COLOR, width=stroke_w)
    return img.resize((size, size), Image.Resampling.LANCZOS)

def create_strip_with_deep_shadows(letters, filename, size=280, overlap_ratio=0.68):
    overlap_step = int(size * overlap_ratio)
    pad_x = 60
    pad_y = 60

    W = pad_x * 2 + (len(letters) - 1) * overlap_step + size
    H = pad_y * 2 + size

    strip = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # Pre-render discs
    discs = []
    positions = []
    for i, item in enumerate(letters):
        disc = generate_avatar_disc(item['rgb'], item['char'], item['dark_text'], size=size)
        x = pad_x + i * overlap_step
        y = pad_y
        discs.append(disc)
        positions.append((x, y))

    # ---------------- 1. Global Elevation Shadow (Floor Shadow) ----------------
    # Create combined silhouette mask of all discs
    combined_mask = Image.new('L', (W, H), 0)
    c_draw = ImageDraw.Draw(combined_mask)
    for x, y in positions:
        c_draw.ellipse([x + 3, y + 3, x + size - 3, y + size - 3], fill=255)

    # Ambient shadow (broad & soft)
    amb_blur = combined_mask.filter(ImageFilter.GaussianBlur(18))
    amb_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    amb_color = Image.new('RGBA', (W, H), (0, 0, 0, 90))
    amb_shifted = Image.new('L', (W, H), 0)
    amb_shifted.paste(amb_blur, (0, 16))
    amb_layer.paste(amb_color, (0, 0), amb_shifted)

    # Contact shadow (sharp & tight)
    con_blur = combined_mask.filter(ImageFilter.GaussianBlur(7))
    con_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    con_color = Image.new('RGBA', (W, H), (0, 0, 0, 110))
    con_shifted = Image.new('L', (W, H), 0)
    con_shifted.paste(con_blur, (0, 6))
    con_layer.paste(con_color, (0, 0), con_shifted)

    strip.alpha_composite(amb_layer)
    strip.alpha_composite(con_layer)

    # ---------------- 2. Layer-by-Layer Composite with Cast Shadows ----------------
    for i in range(len(letters)):
        curr_x, curr_y = positions[i]
        curr_disc = discs[i]

        # Draw current disc
        strip.alpha_composite(curr_disc, (curr_x, curr_y))

        # If there is a next disc, cast its shadow onto this current disc BEFORE drawing next disc!
        if i + 1 < len(letters):
            next_x, next_y = positions[i + 1]

            # Next disc mask
            next_mask = Image.new('L', (W, H), 0)
            nm_draw = ImageDraw.Draw(next_mask)
            nm_draw.ellipse([next_x + 3, next_y + 3, next_x + size - 3, next_y + size - 3], fill=255)

            # Blur and shift left (towards current disc) and slightly down
            # Shift: dx = -14, dy = 3
            blurred_cast = next_mask.filter(ImageFilter.GaussianBlur(13))
            shifted_cast = Image.new('L', (W, H), 0)
            shifted_cast.paste(blurred_cast, (-14, 3))

            # Mask to CURRENT disc's interior so shadow only falls on current disc
            curr_mask = Image.new('L', (W, H), 0)
            cm_draw = ImageDraw.Draw(curr_mask)
            cm_draw.ellipse([curr_x + 3, curr_y + 3, curr_x + size - 3, curr_y + size - 3], fill=255)

            # Final clipped shadow on current disc
            inter_shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            shadow_tint = Image.new('RGBA', (W, H), (0, 0, 0, 175))

            # Combine shifted cast mask with curr disc mask
            combined_cast_alpha = Image.new('L', (W, H), 0)
            # multiply alpha
            from PIL import ImageChops
            cast_on_curr = ImageChops.multiply(shifted_cast, curr_mask)

            inter_shadow.paste(shadow_tint, (0, 0), cast_on_curr)
            strip.alpha_composite(inter_shadow)

    strip.save(filename)
    print(f"Generated {filename} ({W}x{H})")

create_strip_with_deep_shadows(LETTERS_UPPER, 'output/avatars/homeboard-strip-overlapping.png')

# SVG with inter-element drop shadows
def create_svg_with_shadows(letters, filename, size=160, overlap_step=108):
    W = (len(letters) - 1) * overlap_step + size + 60
    H = size + 60
    svg_elements = []

    shadow_filter = '''  <defs>
    <!-- Floor drop shadow -->
    <filter id="floorShadow" x="-20%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.36"/>
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
    <!-- Inter-profile cast shadow -->
    <filter id="castShadow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="-6" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.30"/>
    </filter>
  </defs>'''

    svg_elements.append(shadow_filter)

    for i, item in enumerate(letters):
        cx = 30 + i * overlap_step + size / 2
        cy = 30 + size / 2
        r = (size - 8) / 2
        tc = "#243129" if item['dark_text'] else "#FFF3E5"

        # Each disc has the castShadow filter so it projects shadow onto the circle behind it!
        circle_svg = f'''  <g filter="url(#castShadow)">
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="{item['hex']}" stroke="#31443E" stroke-width="6"/>
    <text x="{cx}" y="{cy + 22}" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="64" font-weight="bold" fill="{tc}" text-anchor="middle">{item['char']}</text>
  </g>'''
        svg_elements.append(circle_svg)

    full_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
''' + "\n".join(svg_elements) + "\n</svg>"

    with open(filename, 'w') as f:
        f.write(full_svg)
    print(f"Generated {filename}")

create_svg_with_shadows(LETTERS_UPPER, 'output/avatars/svg/homeboard-strip-overlapping.svg')
