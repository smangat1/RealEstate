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
    {"char": "H", "name": "Muted Ochre", "hex": "#C98A5B", "rgb": (201, 138, 91), "dark_text": True, "y_off": 16},
    {"char": "O", "name": "Muted Sage", "hex": "#769685", "rgb": (118, 150, 133), "dark_text": True, "y_off": -24},
    {"char": "M", "name": "Terracotta", "hex": "#B86B4D", "rgb": (184, 107, 77), "dark_text": False, "y_off": -50, "reaction": "typing"},
    {"char": "E", "name": "Moss Green", "hex": "#88A492", "rgb": (136, 164, 146), "dark_text": True, "y_off": 16},
    {"char": "B", "name": "Sand Dune", "hex": "#D4A373", "rgb": (212, 163, 115), "dark_text": True, "y_off": -14},
    {"char": "O", "name": "Eucalyptus", "hex": "#5A7B6B", "rgb": (90, 123, 107), "dark_text": False, "y_off": -46, "reaction": "heart"},
    {"char": "A", "name": "Desert Clay", "hex": "#C07856", "rgb": (192, 120, 86), "dark_text": False, "y_off": 20},
    {"char": "R", "name": "Laurel Green", "hex": "#6F8F7E", "rgb": (111, 143, 126), "dark_text": True, "y_off": -42, "reaction": "thumbsup"},
    {"char": "D", "name": "Burnt Sienna", "hex": "#AD5D42", "rgb": (173, 93, 66), "dark_text": False, "y_off": 12},
]

def generate_background_base():
    """
    Creates a rich, cinematic architectural eucalyptus dark background
    with smooth radial ambient glows and soft atmospheric lighting.
    """
    print("Generating base background gradient...")

    # Base Vertical Gradient: #1D2A24 (top) -> #273730 (mid) -> #19241F (bottom)
    gradient_strip = Image.new('RGB', (1, HEIGHT))
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        mid_w = math.sin(t * math.pi) ** 1.3

        r_base = (1 - t) * 29 + t * 25
        g_base = (1 - t) * 42 + t * 36
        b_base = (1 - t) * 36 + t * 31

        r = int((1 - mid_w) * r_base + mid_w * 44)
        g = int((1 - mid_w) * g_base + mid_w * 62)
        b = int((1 - mid_w) * b_base + mid_w * 53)
        gradient_strip.putpixel((0, y), (r, g, b))

    base = gradient_strip.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR).convert('RGBA')

    # Ambient Center Warm Halo (highlights the HOMEBOARD profiles)
    glow_canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    gc_draw = ImageDraw.Draw(glow_canvas)
    cx, cy = WIDTH // 2, HEIGHT // 2
    gw, gh = 2300, 1150
    gc_draw.ellipse([cx - gw // 2, cy - gh // 2, cx + gw // 2, cy + gh // 2], fill=(249, 226, 205, 58))
    glow_blur = glow_canvas.filter(ImageFilter.GaussianBlur(190))
    base.alpha_composite(glow_blur)

    # Top-Left Sage Glow
    tl_canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    tl_draw = ImageDraw.Draw(tl_canvas)
    tl_draw.ellipse([100, -100, 1700, 950], fill=(118, 150, 133, 44))
    tl_blur = tl_canvas.filter(ImageFilter.GaussianBlur(180))
    base.alpha_composite(tl_blur)

    # Bottom-Right Warm Eucalyptus Glow
    br_canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    br_draw = ImageDraw.Draw(br_canvas)
    br_draw.ellipse([WIDTH - 1800, HEIGHT - 1100, WIDTH + 200, HEIGHT + 200], fill=(75, 97, 89, 52))
    br_blur = br_canvas.filter(ImageFilter.GaussianBlur(180))
    base.alpha_composite(br_blur)

    # Subtle Vignette
    vignette = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    v_draw = ImageDraw.Draw(vignette)
    v_draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(12, 18, 15, 80))
    v_mask = Image.new('L', (WIDTH, HEIGHT), 255)
    vm_draw = ImageDraw.Draw(v_mask)
    vm_draw.ellipse([140, 70, WIDTH - 140, HEIGHT - 70], fill=0)
    v_mask = v_mask.filter(ImageFilter.GaussianBlur(180))
    vignette.putalpha(v_mask)
    base.alpha_composite(vignette)

    return base

def create_shaded_sphere(size, base_rgb, opacity=230):
    """
    Renders an elegant 3D shaded sphere in a theme color with soft top-left specular highlight
    and smooth bottom-right shadow.
    """
    scale = 3
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(4 * scale)
    bbox = [pad, pad, s - pad, s - pad]
    # 1. Base sphere fill
    draw.ellipse(bbox, fill=(base_rgb[0], base_rgb[1], base_rgb[2], opacity))

    circle_mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(circle_mask).ellipse(bbox, fill=255)

    # 2. Bottom-right shadow (depth / ambient shading)
    sh_mask = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sh_mask)
    sh_draw.ellipse([int(s * 0.22), int(s * 0.22), s + int(s * 0.1), s + int(s * 0.1)], fill=(0, 0, 0, 90))
    sh_blur = sh_mask.filter(ImageFilter.GaussianBlur(int(14 * scale)))
    # Clip to sphere
    sh_alpha = ImageChops.multiply(sh_blur.split()[3], circle_mask)
    sh_blur.putalpha(sh_alpha)
    img.alpha_composite(sh_blur)

    # 3. Top-left specular highlight
    hl_mask = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    hl_draw = ImageDraw.Draw(hl_mask)
    hl_size = int(s * 0.46)
    hl_draw.ellipse([int(s * 0.14), int(s * 0.12), int(s * 0.14) + hl_size, int(s * 0.12) + hl_size], fill=(255, 255, 255, 80))
    hl_blur = hl_mask.filter(ImageFilter.GaussianBlur(int(12 * scale)))
    hl_alpha = ImageChops.multiply(hl_blur.split()[3], circle_mask)
    hl_blur.putalpha(hl_alpha)
    img.alpha_composite(hl_blur)

    # 4. Refined rim
    draw.ellipse(bbox, outline=(255, 255, 255, 45), width=int(1.2 * scale))
    return img.resize((size, size), Image.Resampling.LANCZOS)

def create_floating_shapes_layer():
    """
    Renders modern architectural floating geometric shapes in the Homeboard theme:
    - 3D shaded spheres in warm terracotta, sand dune, eucalyptus, and sage
    - Frosted glass cards and capsules with glowing borders and soft drop shadows
    - Delicate architectural contour rings
    - Ambient floating micro-reactions (heart, thumbs-up, typing)
    """
    print("Rendering floating architectural shapes...")
    layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))

    # 1. Soft Ambient Bokeh Orbs (Depth of Field in Far Background)
    orbs = [
        (480, 360, 220, (184, 107, 77), 90, 55),    # Terracotta
        (3380, 1280, 250, (90, 123, 107), 100, 60), # Eucalyptus
        (3240, 380, 200, (212, 163, 115), 85, 50),  # Sand Dune
        (660, 1280, 230, (136, 164, 146), 95, 55),  # Moss Green
        (1320, 200, 150, (201, 138, 91), 70, 42),   # Ochre
        (2540, 1460, 170, (192, 120, 86), 75, 45),  # Desert Clay
    ]
    for ox, oy, r, rgb, blur_r, alpha in orbs:
        orb_img = Image.new('RGBA', (r * 2 + 120, r * 2 + 120), (0, 0, 0, 0))
        od = ImageDraw.Draw(orb_img)
        od.ellipse([60, 60, r * 2 + 60, r * 2 + 60], fill=(rgb[0], rgb[1], rgb[2], alpha))
        orb_blur = orb_img.filter(ImageFilter.GaussianBlur(blur_r))
        layer.alpha_composite(orb_blur, (int(ox - r - 60), int(oy - r - 60)))

    # 2. Concentric Architectural Contour Rings
    rings_layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(rings_layer)
    ring_centers = [
        (520, 820, [190, 320, 450, 580], (146, 167, 158, 48)),
        (3320, 820, [190, 320, 450, 580], (146, 167, 158, 48)),
        (1920, -120, [650, 880, 1120], (178, 195, 186, 28)),
        (1920, 1766, [650, 880, 1120], (178, 195, 186, 28)),
    ]
    for rx, ry, rads, stroke_color in ring_centers:
        for rad in rads:
            r_draw.ellipse([rx - rad, ry - rad, rx + rad, ry + rad], outline=stroke_color, width=2)
    layer.alpha_composite(rings_layer)

    # 3. Midground 3D Floating Shaded Spheres with Shadows
    spheres = [
        # (x, y, size, rgb, shadow_dy)
        (760, 360, 140, (184, 107, 77), 28),   # Terracotta sphere
        (3060, 1220, 160, (90, 123, 107), 32), # Eucalyptus sphere
        (3140, 440, 130, (212, 163, 115), 26), # Sand Dune sphere
        (860, 1240, 120, (118, 150, 133), 24), # Sage sphere
        (1440, 1360, 84, (192, 120, 86), 18),  # Desert Clay mini
        (2440, 270, 92, (111, 143, 126), 20),  # Laurel Green mini
        (420, 720, 78, (201, 138, 91), 16),    # Ochre mini
        (3420, 920, 82, (136, 164, 146), 18),  # Moss mini
    ]
    for sx, sy, s_size, rgb, s_dy in spheres:
        # Sphere shadow on background
        pad = 60
        sh_w, sh_h = s_size + pad * 2, s_size + pad * 2
        sh_mask = Image.new('L', (sh_w, sh_h), 0)
        ImageDraw.Draw(sh_mask).ellipse([pad, pad, pad + s_size, pad + s_size], fill=255)
        sh_blur = sh_mask.filter(ImageFilter.GaussianBlur(16))
        sh_img = Image.new('RGBA', (sh_w, sh_h), (0, 0, 0, 0))
        sh_img.paste(Image.new('RGBA', (sh_w, sh_h), (0, 0, 0, 80)), (0, 0), sh_blur)
        layer.alpha_composite(sh_img, (sx - sh_w // 2, sy - sh_h // 2 + s_dy))

        # Shaded sphere
        sphere_img = create_shaded_sphere(s_size, rgb, opacity=235)
        layer.alpha_composite(sphere_img, (sx - s_size // 2, sy - s_size // 2))

    # 4. Floating Frosted Glass Panels & Architectural Capsules
    def make_floating_panel(w, h, radius, rot_deg, fill_rgba, stroke_rgba, stroke_w=2):
        pad = 70
        pw, ph = w + pad * 2, h + pad * 2
        img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # Soft downward shadow
        s_mask = Image.new('L', (pw, ph), 0)
        ImageDraw.Draw(s_mask).rounded_rectangle([pad, pad + 16, pad + w, pad + h + 16], radius=radius, fill=255)
        s_blur = s_mask.filter(ImageFilter.GaussianBlur(20))
        shadow = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
        shadow.paste(Image.new('RGBA', (pw, ph), (0, 0, 0, 85)), (0, 0), s_blur)
        img.alpha_composite(shadow)

        # Panel body with translucent frosted glass
        d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=radius, fill=fill_rgba, outline=stroke_rgba, width=stroke_w)

        if rot_deg != 0:
            img = img.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)
        return img

    panels = [
        # Frosted tinted architectural cards
        (360, 260, 250, 145, 28, -8, (65, 88, 80, 120), (195, 215, 205, 115)),
        (3440, 280, 250, 145, 28, 9, (65, 88, 80, 120), (195, 215, 205, 115)),
        (3280, 1160, 280, 160, 32, -6, (55, 78, 70, 130), (195, 215, 205, 110)),
        (440, 1180, 270, 155, 30, 7, (55, 78, 70, 130), (195, 215, 205, 110)),
        # Theme-tinted frosted capsules
        (840, 190, 190, 64, 32, 12, (184, 107, 77, 85), (240, 175, 150, 125)),   # Terracotta tint
        (2940, 190, 190, 64, 32, -12, (212, 163, 115, 85), (250, 215, 180, 125)), # Sand tint
        (640, 1420, 210, 68, 34, -9, (118, 150, 133, 90), (185, 215, 200, 120)), # Sage tint
        (3100, 1420, 210, 68, 34, 8, (90, 123, 107, 95), (175, 210, 195, 120)),   # Eucalyptus tint
    ]
    for px, py, w, h, rad, rot, fill, stroke in panels:
        p_img = make_floating_panel(w, h, rad, rot, fill, stroke)
        pw, ph = p_img.size
        layer.alpha_composite(p_img, (px - pw // 2, py - ph // 2))

    # 5. Floating Ambient Micro-Reactions in Periphery
    def make_floating_reaction_badge(symbol_type="heart", pill_w=82, pill_h=52, rot_deg=0):
        scale = 3
        pw, ph = pill_w * scale, pill_h * scale
        pad = 40 * scale
        tot_w, tot_h = pw + pad * 2, ph + pad * 2
        img = Image.new('RGBA', (tot_w, tot_h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # Soft shadow
        s_mask = Image.new('L', (tot_w, tot_h), 0)
        ImageDraw.Draw(s_mask).rounded_rectangle([pad, pad + 10 * scale, pad + pw, pad + ph + 10 * scale], radius=ph // 2, fill=255)
        s_blur = s_mask.filter(ImageFilter.GaussianBlur(12 * scale))
        shadow = Image.new('RGBA', (tot_w, tot_h), (0, 0, 0, 0))
        shadow.paste(Image.new('RGBA', (tot_w, tot_h), (0, 0, 0, 75)), (0, 0), s_blur)
        img.alpha_composite(shadow)

        pill_fill = (38, 50, 45, 235)
        pill_border = (125, 150, 140, 220)
        stroke_w = int(1.6 * scale)
        d.rounded_rectangle([pad, pad, pad + pw, pad + ph], radius=ph // 2, fill=pill_fill, outline=pill_border, width=stroke_w)

        if symbol_type == "typing":
            dot_r = int(4.8 * scale)
            dot_cy = pad + ph // 2
            dot_cx = pad + pw // 2
            spacing = int(14.5 * scale)
            dot_color = (220, 230, 225)
            for dx in [-spacing, 0, spacing]:
                d.ellipse([dot_cx + dx - dot_r, dot_cy - dot_r, dot_cx + dx + dot_r, dot_cy + dot_r], fill=dot_color)
        else:
            emoji_font = ImageFont.truetype(FONT_EMOJI, 64)
            symbol = "❤️" if symbol_type == "heart" else "👍"
            e_img = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
            ImageDraw.Draw(e_img).text((15, 15), symbol, font=emoji_font, embedded_color=True)
            bbox = e_img.getbbox()
            if bbox:
                cropped_e = e_img.crop(bbox)
                target_h = int(ph * 0.58)
                ratio = target_h / cropped_e.size[1]
                target_w = int(cropped_e.size[0] * ratio)
                cropped_e = cropped_e.resize((target_w, target_h), Image.Resampling.LANCZOS)
                ex = pad + (pw - target_w) // 2
                ey = pad + (ph - target_h) // 2
                img.alpha_composite(cropped_e, (ex, ey))

        resized = img.resize((pill_w + 80, pill_h + 80), Image.Resampling.LANCZOS)
        if rot_deg != 0:
            resized = resized.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)
        return resized

    ambient_badges = [
        (1080, 360, "heart", 80, 50, -10),
        (2840, 1280, "thumbsup", 80, 50, 12),
        (2780, 380, "typing", 92, 50, 8),
    ]
    for bx, by, b_type, bw, bh, b_rot in ambient_badges:
        b_img = make_floating_reaction_badge(b_type, bw, bh, b_rot)
        layer.alpha_composite(b_img, (bx - b_img.size[0] // 2, by - b_img.size[1] // 2))

    return layer

def generate_avatar_disc(rgb, char, dark_text, size=320):
    """
    Renders an avatar disc at 4x scale and downsamples via Lanczos for razor-sharp typography.
    """
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

def create_modern_reaction_pill(content_type="typing", pill_w=124, pill_h=70):
    """
    Creates an ultra-clean, flat modern reaction capsule with NO drop shadow.
    """
    scale = 4
    pw, ph = pill_w * scale, pill_h * scale
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pill_fill = (38, 50, 45)       # #26322D Sleek deep slate
    pill_border = (118, 142, 132)  # #768E84 Refined crisp border
    stroke_w = int(1.8 * scale)

    # Flat, clean capsule
    draw.rounded_rectangle(
        [stroke_w, stroke_w, pw - stroke_w, ph - stroke_w],
        radius=ph // 2,
        fill=pill_fill,
        outline=pill_border,
        width=stroke_w
    )

    if content_type == "typing":
        dot_r = int(6.2 * scale)
        dot_cy = ph // 2
        dot_cx = pw // 2
        spacing = int(20.5 * scale)
        dot_color = (220, 230, 225)
        for dx in [-spacing, 0, spacing]:
            draw.ellipse([dot_cx + dx - dot_r, dot_cy - dot_r, dot_cx + dx + dot_r, dot_cy + dot_r], fill=dot_color)
    else:
        emoji_font = ImageFont.truetype(FONT_EMOJI, 96)
        symbol = "❤️" if content_type == "heart" else "👍"
        e_img = Image.new('RGBA', (220, 220), (0, 0, 0, 0))
        e_draw = ImageDraw.Draw(e_img)
        e_draw.text((20, 20), symbol, font=emoji_font, embedded_color=True)
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

def generate_floating_profiles_layer():
    """
    Renders the 9 avatar discs spelling HOMEBOARD floating gracefully in the center
    with realistic cast shadows and docked flat reaction capsules.
    """
    print("Rendering central floating HOMEBOARD profiles...")
    layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))

    disc_size = 320
    overlap_step = int(disc_size * 0.68)  # ~218 px

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

    # 1. Soft Ambient Float Drop Shadow under the entire strip onto the background
    s_mask = Image.new('L', (WIDTH, HEIGHT), 0)
    sm_draw = ImageDraw.Draw(s_mask)
    for x, y in positions:
        sm_draw.ellipse([x + 6, y + 6, x + disc_size - 6, y + disc_size - 6], fill=255)

    ambient_blur = s_mask.filter(ImageFilter.GaussianBlur(36))
    ambient_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ambient_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 100)), (0, 0), ImageChops.offset(ambient_blur, 0, 42))

    contact_blur = s_mask.filter(ImageFilter.GaussianBlur(14))
    contact_shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    contact_shadow.paste(Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 70)), (0, 0), ImageChops.offset(contact_blur, 0, 14))

    layer.alpha_composite(ambient_shadow)
    layer.alpha_composite(contact_shadow)

    # 2. Render Discs with Physical Inter-Disc Cast Shadows
    for i in range(len(MUTED_LETTERS)):
        curr_x, curr_y = positions[i]
        layer.alpha_composite(discs[i], (curr_x, curr_y))

        # Inter-disc cast shadow from disc i+1 onto disc i
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
            layer.alpha_composite(inter_shadow)

    # 3. Flat Reaction Capsules (NO DROP SHADOW)
    pills = {
        2: create_modern_reaction_pill("typing", pill_w=124, pill_h=70),   # M: Typing capsule
        5: create_modern_reaction_pill("heart", pill_w=100, pill_h=70),    # O: Heart capsule
        7: create_modern_reaction_pill("thumbsup", pill_w=100, pill_h=70), # R: Thumbs up capsule
    }

    for idx, pill in pills.items():
        px, py = positions[idx]
        pw, ph = pill.size
        bx = px + (disc_size - pw) // 2
        by = py - ph + 15  # Docked cleanly without any drop shadow or tails
        layer.alpha_composite(pill, (bx, by))

    return layer

def build_full_composition(filename="output/avatars/homeboard-floating-background.png"):
    print(f"Starting composition at {WIDTH}x{HEIGHT}...")
    canvas = generate_background_base()
    shapes_layer = create_floating_shapes_layer()
    canvas.alpha_composite(shapes_layer)
    profiles_layer = generate_floating_profiles_layer()
    canvas.alpha_composite(profiles_layer)

    print(f"Saving final master image to {filename}...")
    canvas.save(filename, "PNG", optimize=True)
    print("Saved successfully!")

if __name__ == '__main__':
    build_full_composition()
