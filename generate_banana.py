import os

base_dir = r"c:\Users\T480S\the game\assets\characters"
os.makedirs(base_dir, exist_ok=True)

# Helper function to generate an isometric polygon
def iso_poly(points, fill, stroke="#000", stroke_width=2):
    pts_str = " ".join([f"{x},{y}" for x, y in points])
    return f'<polygon points="{pts_str}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linejoin="round"/>'

# A curved banana shape in isometric projection
# We can make a stylized polygonal banana
banana_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -100 100 120" width="100" height="120">
    <g transform="translate(0, 10)">
        <!-- Banana Stem -->
        {iso_poly([(-5, -60), (0, -65), (5, -60), (2, -50), (-2, -50)], "#8B4513")}
        
        <!-- Banana Body - Left Face -->
        {iso_poly([(-2, -50), (-15, -20), (-10, 10), (0, 20), (5, 5), (0, -20), (2, -50)], "#FFD700", "#DAA520")}
        
        <!-- Banana Body - Right Face -->
        {iso_poly([(2, -50), (0, -20), (5, 5), (0, 20), (15, 0), (10, -25)], "#FFE4B5", "#DAA520")}
        
        <!-- Banana Tip -->
        {iso_poly([(0, 20), (5, 25), (10, 22), (5, 5)], "#654321")}
        
        <!-- Eyes (Nano size) -->
        <circle cx="-5" cy="-10" r="2" fill="#000"/>
        <circle cx="5" cy="-10" r="2" fill="#000"/>
        <!-- Cute Smile -->
        <path d="M -3 -4 Q 0 0 3 -4" fill="none" stroke="#000" stroke-width="1.5"/>
    </g>
</svg>"""

with open(os.path.join(base_dir, "banana.svg"), "w") as f:
    f.write(banana_svg)

print("Generated banana.svg successfully!")
