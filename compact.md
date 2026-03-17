# 3 Plans CompactImplementation

## 1. Fix Listing #0 Not Showing — usePhygitalData.ts

**Problem:** Listing #0 (first listing, nextListingId starts at 0) was completely invisible. `usePhygitalListingByToken` had guard `listingId > 0n` which skipped id=0. The Solidity `listingByToken` mapping returns `0` for both "listing #0 exists" AND "token has no listing", making it impossible to distinguish.

**Solution:** Remove the `listingId > 0n` guard. Instead, always fetch the listing and validate it by checking if `seller !== ZERO_ADDRESS`:

```typescript
const { listing: rawListing, isLoading: listingLoading, refetch } = usePhygitalListing(listingId);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const listing = rawListing && rawListing.seller !== ZERO_ADDR ? rawListing : undefined;
```

**File:** `frontend/src/hooks/usePhygitalData.ts`

---

## 2. Move Phygital Lifecycle Tabs Into Right Column

**Problem:** Order Timeline + Actions tabs were positioned full-width below the entire page, making the layout cluttered and requiring users to scroll to the bottom to see actions.

**Solution:** Move the entire `{isPhygital && listing && (...)}` lifecycle block from **outside the 2-col grid** into **inside the right column**, directly after Redeem Window and before Traits. Adjust indentation from 6-space (top-level section) to 10-space (inside right column div).

**Layout change:**
- OLD: Grid (left: image, right: details) → Below grid: lifecycle tabs (full-width)
- NEW: Grid (left: image, right: details **with lifecycle tabs inside** after Redeem Window)

**File:** `frontend/src/pages/TokenDetailPage.tsx`

---

## 3. Fix Image Stretching + Phone Input Hidden + Redeem Button Disabled

**Problem 1:** Image was stretched vertically to match the height of the right column (which was taller due to form fields).

**Problem 2:** Phone input field was hidden. The reason: `.field-input { width: 100% }` defined in CSS outside `@layer` has higher cascade priority than Tailwind utilities. Select got `field-input w-28 shrink-0`, but the CSS `width: 100%` overrode `w-28`, making select 100% wide → input was pushed off-screen → `buyerPhone` stayed empty → Redeem button stayed disabled.

**Solution 1 (Image):** Add `items-start` to the grid so both columns only stretch to their content height, not to the taller column's height:
```tsx
<div className="grid gap-8 lg:grid-cols-2 items-start">
```

**Solution 2 (Phone input):** Use Tailwind `!important` prefix on select (`!w-28`) to override CSS, and add `min-w-0` to input to prevent flex-1 from causing overflow:
```tsx
<select className="field-input !w-28 shrink-0" {...} />
<input className="field-input flex-1 min-w-0" {...} />
```

**Files:** `frontend/src/pages/TokenDetailPage.tsx`

- Line ~324: `<div className="grid gap-8 lg:grid-cols-2 items-start">`
- Line ~573: `<select className="field-input !w-28 shrink-0" />`
- Line ~582: `<input className="field-input flex-1 min-w-0" />`

---

## Result

✅ Listing #0 now displays correctly with Actions/Buy visible
✅ Lifecycle tabs positioned cleanly inside right column
✅ Image maintains proper aspect ratio (not stretched)
✅ Phone country code select + phone input render correctly side-by-side
✅ Redeem button now clickable when form is filled out
✅ TypeScript builds clean (exit 0)
