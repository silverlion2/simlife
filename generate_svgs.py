import os
import math

base_dir = r"c:\Users\T480S\the game\assets\characters"
os.makedirs(base_dir, exist_ok=True)

# Helper function to generate an isometric polygon
def iso_poly(base_x, base_y, points, fill, stroke="#000", stroke_width=2):
    pts_str = " ".join([f"{base_x + x},{base_y + y}" for x, y in points])
    return f'<polygon points="{pts_str}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linejoin="round"/>'

# Isometric drawing helpers based on width, depth, height
def draw_box(x, y, w, d, h, top_col, left_col, right_col):
    # w: along bottom-right edge
    # d: along bottom-left edge
    # h: height going UP (negative y)
    
    # 2:1 isometric projection
    # dx for w is w, dy for w is w/2
    # dx for d is -d, dy for d is d/2
    
    # Bottom points
    p0 = (0, 0)
    p_w = (w, w/2)
    p_d = (-d, d/2)
    p_wd = (w - d, (w + d)/2)
    
    # Top points
    t0 = (0, -h)
    t_w = (w, w/2 - h)
    t_d = (-d, d/2 - h)
    t_wd = (w - d, (w + d)/2 - h)
    
    out = []
    # Left face (d edge and height)
    out.append(iso_poly(x, y, [p0, p_d, t_d, t0], left_col))
    # Right face (w edge and height)
    out.append(iso_poly(x, y, [p0, p_w, t_w, t0], right_col))
    # Top face
    out.append(iso_poly(x, y, [t0, t_d, t_wd, t_w], top_col))
    
    return "\n".join(out)

# 1. Human
human_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -100 100 120" width="100" height="120">
    <g transform="translate(0, 0)">
        {draw_box(0, -10, 15, 15, 20, "#e8a472", "#d78b5a", "#bf7445")} <!-- Head -->
        {draw_box(0, 15, 12, 12, 25, "#4facfe", "#3d8dd9", "#2970b3")} <!-- Body -->
        {draw_box(-15, 15, 5, 5, 15, "#e8a472", "#d78b5a", "#bf7445")} <!-- Arm L -->
        {draw_box(15, 15, 5, 5, 15, "#e8a472", "#d78b5a", "#bf7445")} <!-- Arm R -->
        {draw_box(-5, 40, 6, 6, 20, "#1c2833", "#141c24", "#0a0f14")} <!-- Leg L -->
        {draw_box(5, 40, 6, 6, 20, "#1c2833", "#141c24", "#0a0f14")} <!-- Leg R -->
    </g>
</svg>"""

with open(os.path.join(base_dir, "human.svg"), "w") as f:
    f.write(human_svg)

# 2. Robot
robot_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -100 100 120" width="100" height="120">
    <g transform="translate(0, 0)">
        {draw_box(0, -15, 20, 20, 20, "#cccccc", "#b3b3b3", "#999999")} <!-- Head -->
        <!-- Eyes -->
        <polygon points="5,-20 10,-17.5 10,-15 5,-17.5" fill="#00ffcc" />
        <polygon points="12,-16.5 17,-14 17,-11.5 12,-14" fill="#00ffcc" />
        <!-- Antenna -->
        {draw_box(0, -35, 2, 2, 15, "#ff3366", "#cc2952", "#991f3d")}
        {draw_box(0, 10, 18, 18, 25, "#a6a6a6", "#8c8c8c", "#737373")} <!-- Body -->
        {draw_box(-20, 10, 8, 8, 18, "#d9d9d9", "#bfbfbf", "#a6a6a6")} <!-- Arm L -->
        {draw_box(20, 10, 8, 8, 18, "#d9d9d9", "#bfbfbf", "#a6a6a6")} <!-- Arm R -->
        <!-- Track / Wheel Base -->
        {draw_box(0, 35, 15, 15, 10, "#404040", "#262626", "#0d0d0d")}
    </g>
</svg>"""

with open(os.path.join(base_dir, "robot.svg"), "w") as f:
    f.write(robot_svg)

# 3. Cat / Pet
cat_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -100 100 120" width="100" height="120">
    <g transform="translate(0, 15)">
        {draw_box(0, -20, 14, 14, 12, "#ffb366", "#e6994d", "#cc8033")} <!-- Head -->
        <!-- Ears -->
        {draw_box(-7, -32, 4, 4, 8, "#ff9933", "#e68019", "#cc6600")}
        {draw_box(7, -32, 4, 4, 8, "#ff9933", "#e68019", "#cc6600")}
        {draw_box(10, 0, 12, 18, 12, "#ffcc99", "#ffb366", "#e6994d")} <!-- Body -->
        <!-- Tail -->
        {draw_box(20, -5, 4, 4, 15, "#ffb366", "#e6994d", "#cc8033")}
        <!-- Legs -->
        {draw_box(-2, 12, 4, 4, 8, "#e6994d", "#cc8033", "#b36626")}
        {draw_box(8, 12, 4, 4, 8, "#e6994d", "#cc8033", "#b36626")}
        {draw_box(-2, -2, 4, 4, 8, "#e6994d", "#cc8033", "#b36626")}
        {draw_box(8, -2, 4, 4, 8, "#e6994d", "#cc8033", "#b36626")}
    </g>
</svg>"""

with open(os.path.join(base_dir, "cat.svg"), "w") as f:
    f.write(cat_svg)
    
print("Generated SVGs successfully!")
