```markdown
# Design System Specification: The Kinetic Minimalist

This design system is a high-end framework engineered specifically for the constrained real estate of browser extensions. It rejects the "widget" aesthetic in favor of a bespoke, editorial experience. By utilizing tonal depth, extreme legibility, and intentional white space, we create a tool that feels like a native part of a professional workflow rather than a third-party add-on.

---

### 1. Creative North Star: "The Digital Curator"
The system is built on the philosophy of **The Digital Curator**. Every element must earn its place. We move beyond the "template" look by employing intentional asymmetry and high-contrast typography. The interface should feel like a lightweight sheet of digital vellum—precise, functional, and whisper-quiet until called upon.

**The Signature Look:**
- **Asymmetric Balance:** Don't center everything. Use generous left-aligned padding to create an editorial flow.
- **Tonal Sophistication:** We replace harsh structural lines with soft shifts in background values.
- **Micro-Precision:** Using 8px–12px radii (`md` to `lg`) to soften the high-contrast palette, ensuring the extension feels approachable yet professional.

---

### 2. Color & Surface Logic
We utilize a monochromatic base to maintain focus, using the `primary` (Electric Blue) only for critical interaction points.

#### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts or subtle tonal transitions.
- **Good:** A `surface-container-low` card sitting on a `surface` background.
- **Bad:** A white card with a #DDD border.

#### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the following tiers to define importance without adding visual noise:
- **Base Layer (`surface`):** The main extension background (#fcf9f8).
- **Secondary Content (`surface-container-low`):** Sub-sections or navigation rails.
- **Interactive Elements (`surface-container-lowest`):** Use the absolute white (#ffffff) to make input fields and primary cards "pop" against the off-white base.

#### The "Glass & Gradient" Rule
For floating elements (like tooltips or dropdowns), utilize Glassmorphism.
- **Token:** `surface` at 80% opacity + 12px Backdrop Blur.
- **CTAs:** Use a subtle linear gradient from `primary` (#0054d6) to `primary_dim` (#004abd) at 135° to give buttons a "tactile soul" that flat colors lack.

---

### 3. Typography: Be Vietnam Pro
We use **Be Vietnam Pro** for its technical precision and modern humanist character. It scales beautifully in small browser popups.

| Role | Token | Size | Weight | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-sm` | 2.25rem | 700 (Bold) | Hero numbers or large data points. |
| **Headline** | `headline-sm`| 1.5rem | 600 (Semi) | Primary view titles. |
| **Title** | `title-md` | 1.125rem | 500 (Medium)| Card headers and modal titles. |
| **Body** | `body-md` | 0.875rem | 400 (Regular)| General content and descriptions. |
| **Label** | `label-md` | 0.75rem | 600 (Bold) | Buttons, Tabs, and Micro-copy. |

**Editorial Note:** Always use `on_surface_variant` (#5f5f5f) for body text to reduce eye strain, reserving `on_surface` (#323232) for headlines to create a strong visual "anchor."

---

### 4. Elevation & Depth: Tonal Layering
Traditional box-shadows are often too heavy for browser extensions. We use **Ambient Depth**.

*   **The Layering Principle:** To lift an element, move up the surface scale. A `surface_container_highest` element naturally feels "closer" to the user than a `surface` element.
*   **Ambient Shadows:** If a floating state is required (e.g., a hovering card), use: `box-shadow: 0 8px 32px rgba(50, 50, 50, 0.06);`. The shadow color is a 6% tint of `on_surface`, not pure black.
*   **The Ghost Border:** If a boundary is required for accessibility, use `outline_variant` at 15% opacity. Never use 100% opacity borders.

---

### 5. Components

#### Buttons
*   **Primary:** Background `primary` gradient, `on_primary` text. Radius: `md` (0.75rem).
*   **Secondary:** Background `secondary_container`, `on_secondary_container` text. No border.
*   **Tertiary (Ghost):** No background. `primary` text. Use `surface_container_high` on hover.

#### Cards & Lists
*   **Requirement:** Forbid divider lines.
*   **Execution:** Use 16px or 24px vertical spacing to separate items. If separation is visually required, use a subtle background shift to `surface_container_low` on every second item (zebra striping) or on hover.

#### Input Fields
*   **Styling:** Background `surface_container_highest`, 0px border, Radius `sm` (0.25rem).
*   **Focus State:** A 2px `primary` "Ghost Border" (20% opacity) and a subtle increase in background brightness.

#### Phosphor Icons
*   **Weight:** Use "Regular" for most UI tasks. Use "Bold" for active navigation states.
*   **Color:** Use `on_surface_variant` for inactive icons; `primary` for active icons.

---

### 6. Do's and Don'ts

#### Do
*   **Do** use `primary` sparingly. It should be a beacon, not a floodlight.
*   **Do** embrace "uncomfortable" white space. If a view feels crowded, increase the padding-bottom of your headlines.
*   **Do** use `surface_container_lowest` (Pure White) for the most important interactive area in the extension.

#### Don't
*   **Don't** use 1px solid borders. They make extensions feel like legacy software.
*   **Don't** use pure #000000 black for text. It vibrates against the #fcf9f8 background. Use `on_surface` (#323232).
*   **Don't** use standard tooltips. Create custom "Glass" tooltips with `backdrop-blur`.

---

### 7. Signature Extension Component: The "Action Rail"
Browser extensions often fail because they bury actions. 
**The Action Rail:** A vertical or horizontal bar using `surface_container_high` with a high `xl` (1.5rem) corner radius. Icons inside should be spaced generously. This creates a floating "control center" feel that sits independently of the content layers.```