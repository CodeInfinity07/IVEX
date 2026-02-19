# RexSquad Bot Manager - Design Guidelines

## Design Approach: Modern Dashboard System

**Selected Framework:** Material Design 3 with dashboard-optimized patterns
**Justification:** This is a utility-focused admin panel requiring information density, clear hierarchy, and efficient workflows. Material Design 3 provides the robust component system needed for complex data displays while maintaining visual clarity.

## Core Design Principles

1. **Information Clarity:** Prioritize readability and scanability of data
2. **Efficient Navigation:** Quick access to all features within 2 clicks
3. **Status Awareness:** Always-visible system status and real-time updates
4. **Mobile Adaptability:** Full functionality on all screen sizes

## Color Palette

### Light Mode
- **Primary:** 220 90% 56% (vibrant blue for actions and highlights)
- **Primary Variant:** 220 85% 45% (darker blue for hover states)
- **Background:** 0 0% 98% (soft white for main content)
- **Surface:** 0 0% 100% (pure white for cards)
- **Surface Variant:** 220 15% 96% (subtle gray for sidebar)
- **Border:** 220 13% 91% (light borders for separation)
- **Text Primary:** 220 18% 20% (dark slate for main text)
- **Text Secondary:** 220 9% 46% (medium gray for labels)

### Dark Mode  
- **Primary:** 220 90% 60% (slightly lighter blue)
- **Background:** 220 18% 12% (dark slate background)
- **Surface:** 220 15% 16% (elevated dark surface)
- **Surface Variant:** 220 18% 20% (sidebar dark)
- **Border:** 220 10% 25% (subtle borders)
- **Text Primary:** 220 15% 95% (light text)
- **Text Secondary:** 220 8% 65% (muted text)

### Status Colors
- **Success:** 142 76% 45% (green for active/success)
- **Warning:** 38 92% 50% (amber for warnings)
- **Error:** 0 84% 60% (red for errors/alerts)
- **Info:** 199 89% 48% (cyan for information)

## Typography

**Font Stack:** 'Inter' (primary), system-ui, -apple-system fallback

**Scale:**
- **Display:** 2.5rem/3rem, weight 700 (page headers)
- **H1:** 2rem/2.5rem, weight 600 (section titles)
- **H2:** 1.5rem/2rem, weight 600 (card headers)
- **H3:** 1.25rem/1.75rem, weight 600 (subsections)
- **Body Large:** 1rem/1.5rem, weight 500 (primary content)
- **Body:** 0.875rem/1.25rem, weight 400 (standard text)
- **Caption:** 0.75rem/1rem, weight 500 (labels, metadata)

## Layout System

**Spacing Units:** Tailwind scale with primary units of 2, 4, 8, 12, 16, 20, 24
- Component padding: p-4 to p-6
- Section spacing: mb-8 to mb-12
- Card gaps: gap-4 to gap-6

**Grid Structure:**
- **Sidebar:** Fixed 280px width desktop, full-screen overlay mobile
- **Main Content:** Dynamic with max-width 1400px container
- **Stats Grid:** 1 column mobile, 2 columns tablet, 4 columns desktop
- **Content Cards:** Single column mobile, 2 columns tablet+

**Breakpoints:**
- Mobile: < 768px
- Tablet: 768px - 1024px  
- Desktop: > 1024px

## Component Library

### Navigation Sidebar
- **Structure:** Fixed position with smooth slide-in animation
- **Header:** Bot logo + name with accent background (surface variant)
- **Menu Items:** Full-width buttons with left border accent on active state
- **Icons:** 20px consistent sizing, positioned left with 12px margin
- **Active State:** Primary color left border (4px), primary/10 background tint
- **Mobile:** Slide-in overlay with backdrop blur, hamburger toggle in header

### Top Bar
- **Height:** 64px fixed
- **Content:** Hamburger menu (mobile), breadcrumbs/page title (left), status indicator + user actions (right)
- **Status Indicator:** Pill-shaped badge with pulsing dot animation, success color when active
- **Sticky:** Position sticky with subtle bottom border shadow

### Stat Cards
- **Layout:** Icon (48px circular) + value (2.5rem) + label (caption)
- **Icon Background:** Gradient from primary to primary-variant, white icon
- **Trend Indicator:** Small arrow + percentage in success/error color (bottom right)
- **Hover:** Subtle lift with shadow elevation increase
- **Border:** 1px solid with hover glow effect

### Data Tables
- **Header:** Surface variant background, sticky positioning
- **Rows:** Alternating subtle backgrounds, 1px bottom border
- **Actions:** Icon buttons revealed on row hover
- **Mobile:** Card-based layout with key-value pairs stacked
- **Pagination:** Bottom-aligned controls with page numbers + arrows

### Member Cards (Mobile)
- **Avatar:** 48px circular with gradient background, initials in white
- **Layout:** Horizontal flex with avatar left, info center, actions right
- **Level Badge:** Colored pill (success/warning/neutral based on level)
- **Swipe Actions:** Reveal delete/edit on left swipe (mobile)

### Activity Logs
- **Container:** Dark terminal-style (220 18% 12% background)
- **Entries:** Left-bordered colored accents (info/success/warning/error)
- **Timestamp:** Monospace font, muted text
- **Auto-scroll:** Latest entries appear at bottom with smooth animation
- **Max Height:** 400px with custom scrollbar styling

### Bot Configuration Panel
- **Layout:** Two-column form with live preview card
- **Inputs:** Outlined style with floating labels
- **Tone Selector:** Radio button grid with visual personality indicators
- **Welcome Preview:** Card showing formatted message with user placeholder
- **Save Button:** Prominent primary action, full-width mobile

### Protection Settings
- **Toggle Switches:** Material-style with smooth animation and state labels
- **Threshold Inputs:** Number inputs with +/- steppers
- **Pattern List:** Chips with delete icons, add new input at bottom
- **Admin List:** Avatar grid with remove overlay on hover

### Modals/Dialogs
- **Backdrop:** Blur effect with 40% opacity dark overlay
- **Content:** Centered card with 16px border radius, max-width 480px
- **Actions:** Right-aligned buttons with 8px gap
- **Close:** X button top-right, ESC key support

## Responsive Behavior

### Mobile (< 768px)
- Sidebar: Full-screen slide-in overlay
- Stats: Single column, full-width cards
- Tables: Transform to vertical card layout
- Forms: Single column, full-width inputs
- Spacing: Reduced to p-4, gap-4

### Tablet (768px - 1024px)  
- Sidebar: Collapsible with icon-only mini mode option
- Stats: 2 column grid
- Tables: Horizontal scroll with sticky first column
- Forms: Strategic 2-column layout for related fields

### Desktop (> 1024px)
- Sidebar: Always visible, 280px fixed
- Stats: 4 column grid
- Tables: Full display with all columns
- Forms: Optimized 2-3 column layout

## Animations & Transitions

**Core Principles:** Subtle, purposeful, non-distracting

- **Page Transitions:** 200ms fade-in for content switches
- **Sidebar Toggle:** 300ms cubic-bezier slide animation  
- **Hover States:** 150ms all properties
- **Status Indicators:** 2s infinite pulse for "active" dots
- **Toasts/Alerts:** Slide-in from top-right, 300ms
- **Loading States:** Skeleton screens with shimmer effect (no spinners)

**Critical:** Respect prefers-reduced-motion for accessibility

## Icons

**Library:** Material Icons via CDN
**Sizing:** 20px standard, 24px for primary actions, 16px for inline
**Color:** Inherit from parent, use text-secondary for passive icons

## Dark Mode Implementation

- Toggle switch in top bar (moon/sun icon)
- Persist preference in localStorage
- Smooth 200ms transition on theme switch
- Ensure all status colors maintain WCAG AA contrast in both modes
- Adjust surface elevations with subtle borders instead of heavy shadows

## Images

No hero images required for this dashboard application. All visual interest comes from:
- Gradient icon backgrounds in stat cards
- User avatars in member lists
- Status indicators and colored badges
- Data visualizations (if charts are added later)

This dashboard prioritizes data density and functionality over decorative imagery.