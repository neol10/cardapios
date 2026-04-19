# Design System Document: High-End Gastronomy Experience

## 1. Overview & Creative North Star
**Creative North Star: "The Epicurean Canvas"**

This design system is built to bridge the gap between high-end editorial print and modern digital interaction. We are moving away from the "standard app" look—characterized by heavy borders and generic grids—and toward a "Gallery" aesthetic. 

The goal is to treat food items like art. We use **intentional asymmetry**, deep **tonal layering**, and **editorial typography** to create an experience that feels curated rather than programmed. The Public Area is a sensory-rich, "vibrant-organic" experience, while the Admin Area shifts into "technical-minimalism"—providing a high-performance environment for management.

---

## 2. Colors
Our color strategy relies on the tension between appetizing warmth (`primary`) and professional stability (`secondary`).

### The Palette (Material Design Tokens)
*   **Primary (`#b12300`):** Use for high-impact brand moments, CTA buttons, and prices.
*   **Surface Hierarchy:**
    *   `surface`: `#f5f6f7` (The base canvas)
    *   `surface-container-low`: `#eff1f2`
    *   `surface-container-lowest`: `#ffffff`
    *   `surface-container-high`: `#e0e3e4`

### Rules of Engagement
*   **The "No-Line" Rule:** We explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. A `surface-container-lowest` card should sit on a `surface-container-low` background to define its shape.
*   **Surface Hierarchy & Nesting:** Treat the UI as a series of physical layers. Use `surface-container-lowest` for the most "active" content (like a product card) to make it "pop" against the darker `surface` tiers.
*   **The "Glass & Gradient" Rule:** For the mobile floating cart and navigation overlays, use Glassmorphism. Apply a semi-transparent `surface` color with a 20px backdrop-blur. 
*   **Signature Textures:** For primary CTAs, use a subtle linear gradient from `primary` (#b12300) to `primary-container` (#ff7859) at a 135-degree angle to add "soul" and depth.

---

## 3. Typography
We use a dual-font strategy to balance character with utility.

*   **Display & Headlines (Plus Jakarta Sans):** This is our "Editorial" voice. It’s wide, modern, and premium. Use `display-lg` for hero categories and `headline-sm` for product names.
*   **Body & Labels (Manrope):** Our "Workhorse" font. It offers exceptional legibility at small sizes. Use `body-md` for descriptions and `label-md` for technical metadata in the Admin dashboard.

**Hierarchy as Identity:**
By pairing a bold `headline-md` (Plus Jakarta Sans) with a quiet, spacious `body-sm` (Manrope), we create the breathing room found in high-end cookbooks.

---

## 4. Elevation & Depth
We don't use shadows to create "distinction"; we use them to create "atmosphere."

*   **The Layering Principle:** Depth is achieved by stacking. A `surface-container-lowest` card on a `surface` background creates a natural, soft lift.
*   **Ambient Shadows:** When a floating effect is required (e.g., the mobile "View Cart" button), use an extra-diffused shadow: `box-shadow: 0 12px 32px -4px rgba(44, 47, 48, 0.08)`. The shadow color is a tinted version of `on-surface`, never pure black.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` (#abadae) at 15% opacity. Never use 100% opaque borders.
*   **Glassmorphism:** Use for floating headers and the mobile cart footer. This keeps the food imagery visible beneath the UI, maintaining a "sensory-first" connection.

---

## 5. Components

### Public Area: The Digital Menu
*   **Product Cards:** No borders. Use `surface-container-lowest` background. Image should be top-aligned with a `lg` (1rem) corner radius. Use `title-md` for the product name and `primary` for the price.
*   **Floating Cart (Mobile):** A fixed footer element using Glassmorphism (Surface color + 80% opacity + blur). Use `xl` (1.5rem) roundedness for the inner button.
*   **Category Chips:** Use `full` (9999px) roundedness. Unselected: `surface-container-high`. Selected: `primary` with `on-primary` text.

### Admin Area: The Dashboard
*   **Data Tables:** Forbid divider lines. Use alternating row colors: `surface-container-lowest` and `surface-container-low`. Use `label-md` for headers in `on-surface-variant`.
*   **Input Fields:** Use a `surface-container-high` background with a `sm` (0.25rem) corner radius. The focus state should be a 2px "Ghost Border" of `primary` at 40% opacity.
*   **Buttons:**
    *   *Primary:* `primary` background, `on-primary` text. State: Hover increases saturation to `primary-dim`.
    *   *Secondary:* `secondary-container` background, `on-secondary-container` text.
    *   *Tertiary (Ghost):* No background. Use `primary` text.

---

## 6. Do's and Don'ts

### Do
*   **Do** use white space aggressively. A premium feel is often the result of what you *don't* put on the screen.
*   **Do** use `primary` sparingly. It is a high-energy "spice"—too much of it ruins the dish.
*   **Do** ensure all food photography is high-contrast and color-corrected to look "delicious" against the `surface` background.

### Don't
*   **Don't** use 1px black or grey dividers between menu items. Use 24px or 32px of vertical white space instead.
*   **Don't** use "Drop Shadows" on text. If text is unreadable over an image, use a subtle `surface-dim` gradient overlay behind the text.
*   **Don't** mix the roundedness scales. Use `lg` for cards and `full` for buttons/chips to maintain a consistent "soft-modern" geometry.

---

## 7. Technical Scales

### Roundedness Scale
*   `sm`: 0.25rem (Inputs)
*   `DEFAULT`: 0.5rem (Standard buttons)
*   `lg`: 1rem (Product cards)
*   `xl`: 1.5rem (Floating containers)
*   `full`: 9999px (Chips/Pills)

### Typography Specs
*   **Headlines:** Plus Jakarta Sans | Medium/Bold (500/700)
*   **Body:** Manrope | Regular (400)
*   **Labels:** Manrope | Semi-Bold (600) | Uppercase for headers.