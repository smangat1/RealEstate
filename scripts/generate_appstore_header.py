import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

os.makedirs('output/avatars', exist_ok=True)

WIDTH = 3840
HEIGHT = 1646

FONT_PATH_HN = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'

STROKE_COLOR = (49, 68, 62)        # #31443E SurfaceDeep
TEXT_DARK = (30, 41, 35)           # #1E2923 Deep Slate
TEXT_LIGHT = (255, 243, 229)       # #FFF3E5 Warm Cream

# Architectural Muted Theme Colors
MUTED_LETTERS = [
    {"char": "H", "name": "Muted Ochre", "hex": "#C98A5B", "rgb": (201, 138, 91), "dark_text": True, "y_off": 12},
    {"char": "O", "name": "Muted Sage", "hex": "#769685", "rgb": (118, 150, 133), "dark_text": True, "y_off": -18},
    {"char": "M", "name": "Terracotta", "hex": "#B86B4D", "rgb": (184, 107, 77), "dark_text": False, "y_off": -44, "reaction": "typing"},
    {"char": "E", "name": "Moss Green", "hex": "#88A492", "rgb": (136, 164, 146), "dark_text": True, "y_off": 14},
    {"char": "B", "name": "Sand Dune", "hex": "#D4A373", "rgb": (212, 163, 115), "dark_text": True, "y_off": -10},
    {"char": "O", "name": "Eucalyptus", "hex": "#5A7B6B", "rgb": (90, 123, 107), "dark_text": False, "y_off": -40, "reaction": "heart"},
    {"char": "A", "name": "Desert Clay", "hex": "#C07856", "rgb": (192, 120, 86), "dark_text": False, "y_off": 18},
    {"char": "R", "name": "Laurel Green", "hex": "#6F8F7E", "rgb": (111, 143, 126), "dark_text": True, "y_off": -36, "reaction": "thumbsup"},
    {"char": "D", "name": "Burnt Sienna", "hex": "#AD5D42", "rgb": (173, 93, 66), "dark_text": False, "y_off": 8},
]

def generate_avatar_disc(rgb, char, dark_text, size=340):
    scale = 4
    canvas_size = size * scale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(5 * scale)
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

def create_modern_reaction_pill(content_type="typing", pill_w=130, pill_h=74):
    scale = 4
    pw, ph = pill_w * scale, pill_h * scale
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pill_fill = (34, 46, 41)       # #222E29 Deep Sleek Charcoal-Slate
    pill_border = (115, 140, 130)  # #738C82 Crisp subtle border
    stroke_w = int(1.6 * scale)

    draw.rounded_rectangle([stroke_w, stroke_w, pw - stroke_w, ph - stroke_w], radius=ph // 2, fill=pill_fill, outline=pill_border, width=stroke_w)

    if content_type == "typing":
        dot_r = int(6.6 * scale)
        dot_cy = ph // 2
        dot_cx = pw // 2
        spacing = int(21.5 * scale)
        dot_color = (220, 230, 225)
        for dx in [-spacing, 0, spacing]:
            draw.ellipse([dot_cx + dx - dot_r, dot_cy - dot_r, dot_cx + dx + dot_r, dot_cy + dot_r], fill=dot_color)
    else:
        emoji_font = ImageFont.truetype(FONT_EMOJI, 96)
        symbol = "❤️" if content_type == "heart" else "👍"
        e_img = Image.new('RGBA', (220, 220), (0, 0, 0, 0))
        ImageDraw.Draw(e_img).text((20, 20), symbol, font=emoji_font, embedded_color=True)
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

def build_appstore_header():
    print("Generating Apple App Store Editorial Header (3840x1646)...")

    # 1. Premium Velvety Apple App Store Eucalyptus Matte Background
    v_strip = Image.new('RGB', (1, HEIGHT))
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        r = int((1 - t) * 48 + t * 38)
        g = int((1 - t) * 67 + t * 54)
        b = int((1 - t) * 60 + t * 48)
        v_strip.putpixel((0, y), (r, g, b))
    canvas = v_strip.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR).convert('RGBA')

    # 2. Fluid Atmospheric Color Fields (Apple App Store Editorial style)
    ambient = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ad = ImageDraw.Draw(ambient)

    # Soft Terracotta warmth in upper left
    ad.ellipse([-200, -200, 1600, 1100], fill=(184, 107, 77, 45))
    # Soft Sage light in lower left
    ad.ellipse([200, 700, 1800, 2000], fill=(118, 150, 133, 48))
    # Soft Sand / Warm Cream glow behind center
    ad.ellipse([WIDTH // 2 - 1400, HEIGHT // 2 - 700, WIDTH // 2 + 1400, HEIGHT // 2 + 700], fill=(249, 226, 205, 50))
    # Deep Eucalyptus richness in upper right
    ad.ellipse([WIDTH - 1600, -200, WIDTH + 200, 1200], fill=(75, 97, 89, 48))
    # Warm Desert Clay in lower right
    ad.ellipse([WIDTH - 1400, 800, WIDTH + 300, 2100], fill=(192, 120, 86, 40))

    ambient_blur = ambient.filter(ImageFilter.GaussianBlur(180))
    canvas.alpha_composite(ambient_blur)

    # 3. Delicate Architectural Topo / Contour Curves (Ultra-subtle, high-end)
    lines_layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines_layer)

    # Delicate concentric curves reflecting architectural blueprints
    for r in [350, 550, 750, 950]:
        ld.ellipse([300 - r, 823 - r, 300 + r, 823 + r], outline=(255, 255, 255, 18), width=1)
    for r in [350, 550, 750, 950]:
        ld.ellipse([WIDTH - 300 - r, 823 - r, WIDTH - 300 + r, 823 + r], outline=(255, 255, 255, 18), width=1)

    # Smooth horizontal ambient horizon curves
    ld.arc([-500, 200, WIDTH + 500, 2200], start=180, end=360, fill=(255, 255, 255, 14), width=1)
    ld.arc([-500, -600, WIDTH + 500, 1400], start=0, end=180, fill=(255, 255, 255, 14), width=1)

    canvas.alpha_composite(lines_layer)

    # 4. Central Hero: Overlapping HOMEBOARD Profiles
    disc_size = 340
    overlap_step = int(disc_size * 0.68) # 231 px
    total_strip_w = (len(MUTED_LETTERS) - 1) * overlap_step + disc_size
    start_x = (WIDTH - total_strip_w) // 2
    base_center_y = HEIGHT // 2

    positions = []
    discs = []
    for i, item in enumerate(MUTED_LETTERS):
        disc = generate_avatar_disc(item['rgb'], item['char'], item['dark_text'], size=disc_size)
        x = start_x + i * overlap_step
        y = base_center_y - disc_size // 2 + item.get('y_off', 0)
        positions.append((x, y))
        discs.append(disc)

    # Apple-style soft drop shadow under the floating profiles
    profiles_layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    s_mask = Image.new('L', (WIDTH, HEIGHT), 0)
    for x, y in positions:
        ImageDraw.Draw(s_mask).ellipse([x + 6, y + 6, x + disc_size - 6, y + disc_size - 6], fill=255)

    ambient_blur = s_mask.filter(ImageFilter.GaussianBlur(38))
    ambient_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ambient_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 90)), (0, 0), ImageChops.offset(ambient_blur, 0, 36))

    contact_blur = s_mask.filter(ImageFilter.GaussianBlur(14))
    contact_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    contact_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 75)), (0, 0), ImageChops.offset(contact_blur, 0, 14))

    profiles_layer.alpha_composite(ambient_shadow)
    profiles_layer.alpha_composite(contact_shadow)

    for i in range(len(MUTED_LETTERS)):
        curr_x, curr_y = positions[i]
        profiles_layer.alpha_composite(discs[i], (curr_x, curr_y))

        if i + 1 < len(MUTED_LETTERS):
            next_x, next_y = positions[i + 1]
            next_mask = Image.new('L', (WIDTH, HEIGHT), 0)
            ImageDraw.Draw(next_mask).ellipse([next_x + 4, next_y + 4, next_x + disc_size - 4, next_y + disc_size - 4], fill=255)
            shifted_cast = ImageChops.offset(next_mask.filter(ImageFilter.GaussianBlur(14)), -14, 6)

            curr_mask = Image.new('L', (WIDTH, HEIGHT), 0)
            ImageDraw.Draw(curr_mask).ellipse([curr_x + 4, curr_y + 4, curr_x + disc_size - 4, curr_y + disc_size - 4], fill=255)

            cast_on_curr = ImageChops.multiply(shifted_cast, curr_mask)
            inter_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
            inter_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 165)), (0, 0), cast_on_curr)
            profiles_layer.alpha_composite(inter_shadow)

    # Modern Flat Reaction Capsules (Zero drop shadow, clean Apple UI style)
    pills = {
        2: create_modern_reaction_pill("typing", pill_w=130, pill_h=74),
        5: create_modern_reaction_pill("heart", pill_w=104, pill_h=74),
        7: create_modern_reaction_pill("thumbsup", pill_w=104, pill_h=74),
    }

    for idx, pill in pills.items():
        px, py = positions[idx]
        pw, ph = pill.size
        bx = px + (disc_size - pw) // 2
        by = py - ph + 16
        profiles_layer.alpha_composite(pill, (bx, by))

    canvas.alpha_composite(profiles_layer)

    # Save to both destinations
    canvas.save('output/avatars/homeboard-appstore-header.png')
    canvas.save('output/avatars/homeboard-floating-background.png')
    print("Saved to output/avatars/homeboard-appstore-header.png and output/avatars/homeboard-floating-background.png")

if __name__ == '__main__':
    build_appstore_header()
