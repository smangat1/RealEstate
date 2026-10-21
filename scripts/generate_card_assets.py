import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

os.makedirs('output/avatars/svg', exist_ok=True)

FONT_PATH_HN = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'

STROKE_COLOR = (49, 68, 62)        # #31443E SurfaceDeep
TEXT_DARK = (30, 41, 35)           # #1E2923 Deep Slate
TEXT_LIGHT = (255, 243, 229)       # #FFF3E5 Warm Cream

CARD_BG = (75, 97, 89)             # #4B6159 Solid Surface
CARD_STROKE = (178, 195, 186, 160) # #B2C3BA ~62% opacity (1.5px)

# Muted, architectural app-theme palette
MUTED_LETTERS = [
    {"char": "H", "name": "Muted Ochre", "hex": "#C98A5B", "rgb": (201, 138, 91), "dark_text": True, "y_off": 0},
    {"char": "O", "name": "Muted Sage", "hex": "#769685", "rgb": (118, 150, 133), "dark_text": True, "y_off": -4},
    {"char": "M", "name": "Terracotta", "hex": "#B86B4D", "rgb": (184, 107, 77), "dark_text": False, "y_off": -18, "reaction": "typing"},
    {"char": "E", "name": "Moss Green", "hex": "#88A492", "rgb": (136, 164, 146), "dark_text": True, "y_off": 0},
    {"char": "B", "name": "Sand Dune", "hex": "#D4A373", "rgb": (212, 163, 115), "dark_text": True, "y_off": -2},
    {"char": "O", "name": "Eucalyptus", "hex": "#5A7B6B", "rgb": (90, 123, 107), "dark_text": False, "y_off": -16, "reaction": "heart"},
    {"char": "A", "name": "Desert Clay", "hex": "#C07856", "rgb": (192, 120, 86), "dark_text": False, "y_off": 0},
    {"char": "R", "name": "Laurel Green", "hex": "#6F8F7E", "rgb": (111, 143, 126), "dark_text": True, "y_off": -16, "reaction": "thumbsup"},
    {"char": "D", "name": "Burnt Sienna", "hex": "#AD5D42", "rgb": (173, 93, 66), "dark_text": False, "y_off": 0},
]

def generate_avatar_disc(rgb, char, dark_text, size=220):
    scale = 4
    canvas_size = size * scale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(4 * scale)
    circle_box = [pad, pad, canvas_size - pad, canvas_size - pad]
    stroke_w = int(size * 0.038 * scale)

    draw.ellipse(circle_box, fill=rgb)

    f_size = int(size * 0.40 * scale)
    font = ImageFont.truetype(FONT_PATH_HN, f_size, index=1)
    bbox = draw.textbbox((0, 0), char, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    tx = (canvas_size - text_w) / 2 - bbox[0]
    ty = (canvas_size - text_h) / 2 - bbox[1]

    text_color = TEXT_DARK if dark_text else TEXT_LIGHT
    draw.text((tx, ty), char, font=font, fill=text_color)
    draw.ellipse(circle_box, outline=STROKE_COLOR, width=stroke_w)
    return img.resize((size, size), Image.Resampling.LANCZOS)

def create_modern_pill(content_type="typing", pill_w=78, pill_h=46):
    """
    Creates an ultra-clean, minimal modern reaction capsule with NO drop shadow and NO tails.
    """
    scale = 4
    pw, ph = pill_w * scale, pill_h * scale
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Modern muted dark slate capsule (clean, high contrast, non-cartoonish)
    pill_fill = (38, 50, 45)       # #26322D Sleek deep slate
    pill_border = (118, 142, 132)  # #768E84 Crisp refined border
    stroke_w = int(1.5 * scale)

    # Clean capsule with flat, crisp edges
    draw.rounded_rectangle(
        [stroke_w, stroke_w, pw - stroke_w, ph - stroke_w],
        radius=ph // 2,
        fill=pill_fill,
        outline=pill_border,
        width=stroke_w
    )

    if content_type == "typing":
        # 3 clean circular dots
        dot_r = int(4.2 * scale)
        dot_cy = ph // 2
        dot_cx = pw // 2
        spacing = int(13.5 * scale)
        dot_color = (220, 230, 225)
        for dx in [-spacing, 0, spacing]:
            draw.ellipse([dot_cx + dx - dot_r, dot_cy - dot_r, dot_cx + dx + dot_r, dot_cy + dot_r], fill=dot_color)
    else:
        # Crisp native emoji
        emoji_font = ImageFont.truetype(FONT_EMOJI, 64)
        symbol = "❤️" if content_type == "heart" else "👍"

        e_img = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
        e_draw = ImageDraw.Draw(e_img)
        e_draw.text((15, 15), symbol, font=emoji_font, embedded_color=True)
        bbox = e_img.getbbox()
        if bbox:
            cropped_e = e_img.crop(bbox)
            target_h = int(ph * 0.58)
            ratio = target_h / cropped_e.size[1]
            target_w = int(cropped_e.size[0] * ratio)
            cropped_e = cropped_e.resize((target_w, target_h), Image.Resampling.LANCZOS)
            ex = (pw - target_w) // 2
            ey = (ph - target_h) // 2
            img.alpha_composite(cropped_e, (ex, ey))

    return img.resize((pill_w, pill_h), Image.Resampling.LANCZOS)

def build_card_clean(filename="output/avatars/homeboard-strip-card.png"):
    disc_size = 220
    overlap_step = int(disc_size * 0.68)  # 150 px

    strip_w = (len(MUTED_LETTERS) - 1) * overlap_step + disc_size
    strip_h = disc_size

    card_pad_x = 100
    card_pad_top = 135
    reserved_subtext_room = 250

    card_w = strip_w + card_pad_x * 2
    card_h = card_pad_top + strip_h + reserved_subtext_room
    card_radius = 48

    shadow_margin = 90
    canvas_w = card_w + shadow_margin * 2
    canvas_h = card_h + shadow_margin * 2

    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    card_x = shadow_margin
    card_y = shadow_margin

    # ---------------- 1. Clean UI Drop Shadow on Card ONLY ----------------
    card_mask = Image.new('L', (canvas_w, canvas_h), 0)
    cm_draw = ImageDraw.Draw(card_mask)
    cm_draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=card_radius, fill=255)

    main_blur = card_mask.filter(ImageFilter.GaussianBlur(20))
    main_shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    main_shadow.paste(Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 78)), (0, 0), ImageChops.offset(main_blur, 0, 12))

    contact_blur = card_mask.filter(ImageFilter.GaussianBlur(7))
    contact_shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    contact_shadow.paste(Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 50)), (0, 0), ImageChops.offset(contact_blur, 0, 4))

    canvas.alpha_composite(main_shadow)
    canvas.alpha_composite(contact_shadow)

    # ---------------- 2. Solid Card Surface ----------------
    scale = 2
    hi_surface = Image.new('RGBA', (card_w * scale, card_h * scale), (0, 0, 0, 0))
    hi_draw = ImageDraw.Draw(hi_surface)
    hi_draw.rounded_rectangle(
        [0, 0, card_w * scale, card_h * scale],
        radius=card_radius * scale,
        fill=CARD_BG,
        outline=CARD_STROKE,
        width=int(1.5 * scale)
    )
    card_surface = hi_surface.resize((card_w, card_h), Image.Resampling.LANCZOS)

    # ---------------- 3. Overlapping Avatar Strip ----------------
    strip_layer = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    strip_start_x = card_pad_x
    strip_start_y = card_pad_top

    discs = []
    positions = []
    for i, item in enumerate(MUTED_LETTERS):
        disc = generate_avatar_disc(item['rgb'], item['char'], item['dark_text'], size=disc_size)
        x = strip_start_x + i * overlap_step
        y = strip_start_y + item.get('y_off', 0)
        discs.append(disc)
        positions.append((x, y))

    # Soft contact shadow under the strip on the card
    strip_silhouette = Image.new('L', (card_w, card_h), 0)
    ss_draw = ImageDraw.Draw(strip_silhouette)
    for x, y in positions:
        ss_draw.ellipse([x + 3, y + 3, x + disc_size - 3, y + disc_size - 3], fill=255)

    strip_blur = strip_silhouette.filter(ImageFilter.GaussianBlur(10))
    strip_shadow = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    strip_shadow.paste(Image.new('RGBA', (card_w, card_h), (0, 0, 0, 68)), (0, 0), ImageChops.offset(strip_blur, 0, 8))
    strip_layer.alpha_composite(strip_shadow)

    # Discs and inter-disc cast shadows
    for i in range(len(MUTED_LETTERS)):
        curr_x, curr_y = positions[i]
        strip_layer.alpha_composite(discs[i], (curr_x, curr_y))

        if i + 1 < len(MUTED_LETTERS):
            next_x, next_y = positions[i + 1]
            next_mask = Image.new('L', (card_w, card_h), 0)
            ImageDraw.Draw(next_mask).ellipse([next_x + 3, next_y + 3, next_x + disc_size - 3, next_y + disc_size - 3], fill=255)

            shifted_cast = ImageChops.offset(next_mask.filter(ImageFilter.GaussianBlur(10)), -10, 4)

            curr_mask = Image.new('L', (card_w, card_h), 0)
            ImageDraw.Draw(curr_mask).ellipse([curr_x + 3, curr_y + 3, curr_x + disc_size - 3, curr_y + disc_size - 3], fill=255)

            cast_on_curr = ImageChops.multiply(shifted_cast, curr_mask)
            inter_shadow = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
            inter_shadow.paste(Image.new('RGBA', (card_w, card_h), (0, 0, 0, 160)), (0, 0), cast_on_curr)
            strip_layer.alpha_composite(inter_shadow)

    # ----------------- 4. Modern Flat Reactions (NO DROP SHADOW) -----------------
    pills = {
        2: create_modern_pill("typing", pill_w=82, pill_h=48),   # M: Sleek 3-dot typing capsule
        5: create_modern_pill("heart", pill_w=68, pill_h=48),    # O: Clean heart capsule
        7: create_modern_pill("thumbsup", pill_w=68, pill_h=48), # R: Clean thumbs-up capsule
    }

    for idx, pill in pills.items():
        px, py = positions[idx]
        pw, ph = pill.size
        bx = px + (disc_size - pw) // 2
        by = py - ph + 10  # Docked cleanly without any drop shadow or tails
        strip_layer.alpha_composite(pill, (bx, by))

    card_surface.alpha_composite(strip_layer)
    canvas.alpha_composite(card_surface, (card_x, card_y))
    canvas.save(filename)
    print(f"Saved PNG to {filename}")

def build_card_svg(filename="output/avatars/svg/homeboard-strip-card.svg"):
    disc_size = 140
    overlap_step = 95
    strip_w = (len(MUTED_LETTERS) - 1) * overlap_step + disc_size
    pad_x = 65
    pad_top = 95
    reserved_room = 160
    card_w = strip_w + pad_x * 2
    card_h = pad_top + disc_size + reserved_room
    margin = 60
    svg_w = card_w + margin * 2
    svg_h = card_h + margin * 2

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" width="{svg_w}" height="{svg_h}">',
        '  <defs>',
        '    <filter id="cardDropShadow" x="-20%" y="-20%" width="140%" height="150%">',
        '      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.30"/>',
        '      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.18"/>',
        '    </filter>',
        '    <filter id="castShadow" x="-30%" y="-20%" width="160%" height="160%">',
        '      <feDropShadow dx="-6" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.55"/>',
        '      <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000000" flood-opacity="0.25"/>',
        '    </filter>',
        '  </defs>',
        '',
        '  <!-- Clean Rounded Card Box with Drop Shadow -->',
        f'  <rect x="{margin}" y="{margin}" width="{card_w}" height="{card_h}" rx="32" fill="#4B6159" stroke="#B2C3BA" stroke-width="1.5" stroke-opacity="0.62" filter="url(#cardDropShadow)"/>',
        '',
        f'  <!-- Overlapping Avatar Strip -->',
        f'  <g transform="translate({margin + pad_x}, {margin + pad_top})">'
    ]

    positions = []
    for i, item in enumerate(MUTED_LETTERS):
        cx = i * overlap_step + disc_size / 2
        cy = disc_size / 2 + item.get("y_off", 0) * (disc_size / 220)
        positions.append((cx, cy))
        text_color = "#1E2923" if item["dark_text"] else "#FFF3E5"
        svg_lines.append(f'    <g filter="url(#castShadow)">')
        svg_lines.append(f'      <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{disc_size/2 - 3:.1f}" fill="{item["hex"]}" stroke="#31443E" stroke-width="5"/>')
        svg_lines.append(f'      <text x="{cx:.1f}" y="{cy + 20:.1f}" font-family="-apple-system, BlinkMacSystemFont, \'Helvetica Neue\', Arial, sans-serif" font-size="56" font-weight="bold" fill="{text_color}" text-anchor="middle">{item["char"]}</text>')
        svg_lines.append(f'    </g>')

    # Flat Reactions without drop shadow
    # 1. M: Typing bubble (cx, cy)
    m_cx, m_cy = positions[2]
    tw, th = 52, 30
    tx = m_cx - tw / 2
    ty = m_cy - disc_size / 2 - th + 7
    svg_lines.extend([
        f'    <!-- Muted Gray Typing Capsule (M) - ZERO drop shadow -->',
        f'    <g transform="translate({tx:.1f}, {ty:.1f})">',
        f'      <rect x="0" y="0" width="{tw}" height="{th}" rx="{th/2}" fill="#26322D" stroke="#768E84" stroke-width="1.5"/>',
        f'      <circle cx="{tw/2 - 10}" cy="{th/2}" r="2.8" fill="#DCE6E1"/>',
        f'      <circle cx="{tw/2}" cy="{th/2}" r="2.8" fill="#DCE6E1"/>',
        f'      <circle cx="{tw/2 + 10}" cy="{th/2}" r="2.8" fill="#DCE6E1"/>',
        f'    </g>'
    ])

    # 2. O: Heart reaction
    o_cx, o_cy = positions[5]
    rw, rh = 44, 30
    rx_o = o_cx - rw / 2
    ry_o = o_cy - disc_size / 2 - rh + 7
    svg_lines.extend([
        f'    <!-- Heart Reaction Capsule (O) - ZERO drop shadow -->',
        f'    <g transform="translate({rx_o:.1f}, {ry_o:.1f})">',
        f'      <rect x="0" y="0" width="{rw}" height="{rh}" rx="{rh/2}" fill="#26322D" stroke="#768E84" stroke-width="1.5"/>',
        f'      <text x="{rw/2}" y="{rh/2 + 6.5}" font-size="17" text-anchor="middle">❤️</text>',
        f'    </g>'
    ])

    # 3. R: Thumbs Up reaction
    r_cx, r_cy = positions[7]
    rx_r = r_cx - rw / 2
    ry_r = r_cy - disc_size / 2 - rh + 7
    svg_lines.extend([
        f'    <!-- Thumbs Up Reaction Capsule (R) - ZERO drop shadow -->',
        f'    <g transform="translate({rx_r:.1f}, {ry_r:.1f})">',
        f'      <rect x="0" y="0" width="{rw}" height="{rh}" rx="{rh/2}" fill="#26322D" stroke="#768E84" stroke-width="1.5"/>',
        f'      <text x="{rw/2}" y="{rh/2 + 6.5}" font-size="17" text-anchor="middle">👍</text>',
        f'    </g>'
    ])

    svg_lines.append('  </g>')
    svg_lines.append('  <!-- Generous room below reserved for your custom italicized orange subtext -->')
    svg_lines.append('</svg>')

    with open(filename, 'w') as f:
        f.write('\n'.join(svg_lines))
    print(f"Saved SVG to {filename}")

if __name__ == '__main__':
    build_card_clean()
    build_card_svg()
