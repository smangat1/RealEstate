import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

os.makedirs('output/avatars', exist_ok=True)

# Apple App Store Search Results Creative Asset Specification
WIDTH = 1920
HEIGHT = 1280

FONT_PATH_HN = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'

STROKE_COLOR = (49, 68, 62)        # #31443E SurfaceDeep
TEXT_DARK = (30, 41, 35)           # #1E2923 Deep Slate
TEXT_LIGHT = (255, 243, 229)       # #FFF3E5 Warm Cream
CARD_BG = (75, 97, 89)             # #4B6159 Solid Surface
CARD_STROKE = (178, 195, 186, 160) # #B2C3BA ~62% opacity

MUTED_LETTERS = [
    {"char": "H", "name": "Muted Ochre", "hex": "#C98A5B", "rgb": (201, 138, 91), "dark_text": True, "y_off": 0},
    {"char": "O", "name": "Muted Sage", "hex": "#769685", "rgb": (118, 150, 133), "dark_text": True, "y_off": -4},
    {"char": "M", "name": "Terracotta", "hex": "#B86B4D", "rgb": (184, 107, 77), "dark_text": False, "y_off": -16, "reaction": "typing"},
    {"char": "E", "name": "Moss Green", "hex": "#88A492", "rgb": (136, 164, 146), "dark_text": True, "y_off": 0},
    {"char": "B", "name": "Sand Dune", "hex": "#D4A373", "rgb": (212, 163, 115), "dark_text": True, "y_off": -2},
    {"char": "O", "name": "Eucalyptus", "hex": "#5A7B6B", "rgb": (90, 123, 107), "dark_text": False, "y_off": -14, "reaction": "heart"},
    {"char": "A", "name": "Desert Clay", "hex": "#C07856", "rgb": (192, 120, 86), "dark_text": False, "y_off": 0},
    {"char": "R", "name": "Laurel Green", "hex": "#6F8F7E", "rgb": (111, 143, 126), "dark_text": True, "y_off": -14, "reaction": "thumbsup"},
    {"char": "D", "name": "Burnt Sienna", "hex": "#AD5D42", "rgb": (173, 93, 66), "dark_text": False, "y_off": 0},
]

def generate_avatar_disc(rgb, char, dark_text, size=180):
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

def create_modern_reaction_pill(content_type="typing", pill_w=72, pill_h=42):
    scale = 4
    pw, ph = pill_w * scale, pill_h * scale
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pill_fill = (38, 50, 45)       # #26322D Sleek deep slate
    pill_border = (118, 142, 132)  # #768E84 Crisp refined border
    stroke_w = int(1.5 * scale)
    draw.rounded_rectangle([stroke_w, stroke_w, pw - stroke_w, ph - stroke_w], radius=ph // 2, fill=pill_fill, outline=pill_border, width=stroke_w)

    if content_type == "typing":
        dot_r = int(3.8 * scale)
        dot_cy = ph // 2
        dot_cx = pw // 2
        spacing = int(12.5 * scale)
        dot_color = (220, 230, 225)
        for dx in [-spacing, 0, spacing]:
            draw.ellipse([dot_cx + dx - dot_r, dot_cy - dot_r, dot_cx + dx + dot_r, dot_cy + dot_r], fill=dot_color)
    else:
        emoji_font = ImageFont.truetype(FONT_EMOJI, 48)
        symbol = "❤️" if content_type == "heart" else "👍"
        e_img = Image.new('RGBA', (120, 120), (0, 0, 0, 0))
        ImageDraw.Draw(e_img).text((10, 10), symbol, font=emoji_font, embedded_color=True)
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

def build_search_result_asset():
    print(f"Building App Store Search Results Creative Asset ({WIDTH}x{HEIGHT})...")

    # 1. Velvety Apple App Store Eucalyptus Matte Background
    v_strip = Image.new('RGB', (1, HEIGHT))
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        r = int((1 - t) * 46 + t * 35)
        g = int((1 - t) * 64 + t * 50)
        b = int((1 - t) * 57 + t * 43)
        v_strip.putpixel((0, y), (r, g, b))
    canvas = v_strip.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR).convert('RGBA')

    # Ambient Light Blooms
    ambient = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ad = ImageDraw.Draw(ambient)
    ad.ellipse([-150, -150, 1100, 800], fill=(184, 107, 77, 45))
    ad.ellipse([100, 500, 1200, 1500], fill=(118, 150, 133, 46))
    ad.ellipse([WIDTH // 2 - 900, HEIGHT // 2 - 500, WIDTH // 2 + 900, HEIGHT // 2 + 500], fill=(249, 226, 205, 50))
    ad.ellipse([WIDTH - 1100, -150, WIDTH + 150, 800], fill=(75, 97, 89, 48))
    ad.ellipse([WIDTH - 1000, 550, WIDTH + 200, 1500], fill=(192, 120, 86, 38))
    ambient_blur = ambient.filter(ImageFilter.GaussianBlur(140))
    canvas.alpha_composite(ambient_blur)

    # Architectural Blueprint Contour Hairlines
    lines_layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines_layer)
    for r in [240, 380, 520, 660]:
        ld.ellipse([200 - r, 640 - r, 200 + r, 640 + r], outline=(255, 255, 255, 18), width=1)
    for r in [240, 380, 520, 660]:
        ld.ellipse([WIDTH - 200 - r, 640 - r, WIDTH - 200 + r, 640 + r], outline=(255, 255, 255, 18), width=1)
    canvas.alpha_composite(lines_layer)

    # 2. Elevated Homeboard Card Component (with Avatar Strip + Generous Room Below)
    disc_size = 180
    overlap_step = int(disc_size * 0.68) # 122 px
    strip_w = (len(MUTED_LETTERS) - 1) * overlap_step + disc_size

    pad_x = 90
    pad_top = 110
    reserved_subtext = 240

    card_w = strip_w + pad_x * 2 # 1336 px
    card_h = pad_top + disc_size + reserved_subtext # 530 px
    card_rad = 42

    card_x = (WIDTH - card_w) // 2
    card_y = (HEIGHT - card_h) // 2

    # Clean UI Drop Shadow on Card
    card_mask = Image.new('L', (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(card_mask).rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=card_rad, fill=255)

    main_blur = card_mask.filter(ImageFilter.GaussianBlur(32))
    main_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    main_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 95)), (0, 0), ImageChops.offset(main_blur, 0, 24))

    contact_blur = card_mask.filter(ImageFilter.GaussianBlur(10))
    contact_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    contact_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 70)), (0, 0), ImageChops.offset(contact_blur, 0, 8))

    canvas.alpha_composite(main_shadow)
    canvas.alpha_composite(contact_shadow)

    # Card Surface (#4B6159 Solid Eucalyptus)
    card_surface = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    cs_draw = ImageDraw.Draw(card_surface)
    cs_draw.rounded_rectangle([0, 0, card_w, card_h], radius=card_rad, fill=CARD_BG, outline=CARD_STROKE, width=2)

    # Overlapping Avatar Strip on Card
    strip_layer = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    positions = []
    discs = []
    for i, item in enumerate(MUTED_LETTERS):
        disc = generate_avatar_disc(item['rgb'], item['char'], item['dark_text'], size=disc_size)
        x = pad_x + i * overlap_step
        y = pad_top + item.get('y_off', 0)
        positions.append((x, y))
        discs.append(disc)

    # Soft shadow under avatars onto card
    s_mask = Image.new('L', (card_w, card_h), 0)
    for x, y in positions:
        ImageDraw.Draw(s_mask).ellipse([x + 3, y + 3, x + disc_size - 3, y + disc_size - 3], fill=255)
    s_blur = s_mask.filter(ImageFilter.GaussianBlur(10))
    s_shadow = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    s_shadow.paste(Image.new('RGBA', (card_w, card_h), (0, 0, 0, 68)), (0, 0), ImageChops.offset(s_blur, 0, 7))
    strip_layer.alpha_composite(s_shadow)

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

    # Reaction Capsules on Card (Zero drop shadow)
    pills = {
        2: create_modern_reaction_pill("typing", pill_w=74, pill_h=44),
        5: create_modern_reaction_pill("heart", pill_w=62, pill_h=44),
        7: create_modern_reaction_pill("thumbsup", pill_w=62, pill_h=44),
    }

    for idx, pill in pills.items():
        px, py = positions[idx]
        pw, ph = pill.size
        bx = px + (disc_size - pw) // 2
        by = py - ph + 10
        strip_layer.alpha_composite(pill, (bx, by))

    card_surface.alpha_composite(strip_layer)
    canvas.alpha_composite(card_surface, (card_x, card_y))

    # Flatten to solid RGB (Required by App Store Connect without alpha channel)
    final_rgb = Image.new('RGB', (WIDTH, HEIGHT), (46, 64, 57))
    final_rgb.paste(canvas, (0, 0), canvas)

    out_png = 'output/avatars/homeboard-search-result-asset.png'
    out_jpg = 'output/avatars/homeboard-search-result-asset.jpg'
    final_rgb.save(out_png, quality=100)
    final_rgb.save(out_jpg, quality=98)
    print(f"Saved Search Result Assets:\n - {out_png}\n - {out_jpg}")

if __name__ == '__main__':
    build_search_result_asset()
