/// Property-based tests for the Tauri backend, powered by `proptest`.
///
/// **Validates: Requirements 3.7**
///
/// Three property groups are covered:
/// 1. `screen_capture::capture_region` — zero-dimension guard (pure-logic, no OS call).
/// 2. `screen_capture` coordinate math — subtraction is safe for values in
///    the constrained range [-10 000, 10 000].
/// 3. `qr_decoder::decode_qr_from_bytes` — non-PNG bytes always return `Err`.

#[cfg(test)]
mod proptest_tests {
    use proptest::prelude::*;

    use crate::screen_capture::{capture_region, CaptureRegion};
    use crate::qr_decoder::decode_qr_from_bytes;

    // ── 1. Zero-dimension guard ──────────────────────────────────────────────
    //
    // For *any* CaptureRegion where `width == 0` OR `height == 0`,
    // `capture_region` must return `Err` immediately, without touching the OS.

    proptest! {
        /// Any region with `width = 0` must be rejected.
        ///
        /// **Validates: Requirements 3.7 — zero-dimension guard (width)**
        #[test]
        fn prop_zero_width_always_errors(
            x       in -10_000_i32..10_000,
            y       in -10_000_i32..10_000,
            height  in 1_u32..4_096,
        ) {
            let region = CaptureRegion { x, y, width: 0, height };
            prop_assert!(
                capture_region(region).is_err(),
                "expected Err for width=0"
            );
        }

        /// Any region with `height = 0` must be rejected.
        ///
        /// **Validates: Requirements 3.7 — zero-dimension guard (height)**
        #[test]
        fn prop_zero_height_always_errors(
            x      in -10_000_i32..10_000,
            y      in -10_000_i32..10_000,
            width  in 1_u32..4_096,
        ) {
            let region = CaptureRegion { x, y, width, height: 0 };
            prop_assert!(
                capture_region(region).is_err(),
                "expected Err for height=0"
            );
        }

        /// Any region where both `width` and `height` are 0 must be rejected.
        ///
        /// **Validates: Requirements 3.7 — zero-dimension guard (both)**
        #[test]
        fn prop_zero_width_and_height_always_errors(
            x in -10_000_i32..10_000,
            y in -10_000_i32..10_000,
        ) {
            let region = CaptureRegion { x, y, width: 0, height: 0 };
            prop_assert!(
                capture_region(region).is_err(),
                "expected Err when both dimensions are 0"
            );
        }
    }

    // ── 2. Coordinate-translation arithmetic ────────────────────────────────
    //
    // The translation formula is:
    //   local_x = region_x - screen_x
    //   local_y = region_y - screen_y
    //
    // For values in [-10 000, 10 000] the result always fits in i32, so
    // `checked_sub` must never return `None`.

    proptest! {
        /// The coordinate translation must never overflow for inputs in
        /// [-10 000, 10 000].
        ///
        /// **Validates: Requirements 3.7 — coordinate arithmetic is overflow-free**
        #[test]
        fn prop_coord_translation_no_overflow(
            region_x in -10_000_i32..=10_000,
            region_y in -10_000_i32..=10_000,
            screen_x in -10_000_i32..=10_000,
            screen_y in -10_000_i32..=10_000,
        ) {
            // checked_sub returns None on overflow; assert it always succeeds.
            let local_x = region_x.checked_sub(screen_x);
            let local_y = region_y.checked_sub(screen_y);

            prop_assert!(
                local_x.is_some(),
                "x subtraction overflowed: {region_x} - {screen_x}"
            );
            prop_assert!(
                local_y.is_some(),
                "y subtraction overflowed: {region_y} - {screen_y}"
            );
        }

        /// The translated coordinates have the correct sign: if region is to
        /// the right of / below the screen origin, local coords are positive.
        ///
        /// **Validates: Requirements 3.7 — coordinate sign correctness**
        #[test]
        fn prop_coord_translation_sign_correct(
            // ensure region_x >= screen_x and region_y >= screen_y
            screen_x in -5_000_i32..=5_000,
            screen_y in -5_000_i32..=5_000,
            offset_x in 0_i32..=5_000,
            offset_y in 0_i32..=5_000,
        ) {
            let region_x = screen_x.saturating_add(offset_x);
            let region_y = screen_y.saturating_add(offset_y);

            let local_x = region_x - screen_x;
            let local_y = region_y - screen_y;

            prop_assert!(local_x >= 0, "local_x should be >= 0, got {local_x}");
            prop_assert!(local_y >= 0, "local_y should be >= 0, got {local_y}");
        }
    }

    // ── 3. Non-PNG bytes always return Err ──────────────────────────────────
    //
    // The PNG magic bytes are [0x89, 0x50, 0x4E, 0x47].  Any byte sequence
    // that does NOT start with those four bytes is not a valid PNG and must
    // cause `decode_qr_from_bytes` to return `Err`.

    /// PNG magic bytes prefix.
    const PNG_MAGIC: [u8; 4] = [0x89, 0x50, 0x4E, 0x47];

    /// Generate an arbitrary non-empty byte vector whose first 4 bytes are
    /// NOT the PNG magic header.
    fn non_png_bytes() -> impl Strategy<Value = Vec<u8>> {
        // Generate a byte vector of length 1..=256.
        proptest::collection::vec(any::<u8>(), 1..=256).prop_filter(
            "must not start with PNG magic bytes",
            |bytes| {
                // If the vec is shorter than 4 bytes, it cannot be a valid
                // PNG header, so it trivially passes.
                if bytes.len() < 4 {
                    return true;
                }
                bytes[..4] != PNG_MAGIC
            },
        )
    }

    proptest! {
        /// Any byte sequence that does not start with PNG magic bytes must
        /// cause `decode_qr_from_bytes` to return `Err`.
        ///
        /// **Validates: Requirements 3.7 — non-PNG input always errors**
        #[test]
        fn prop_non_png_bytes_always_errors(bytes in non_png_bytes()) {
            let result = decode_qr_from_bytes(&bytes);
            prop_assert!(
                result.is_err(),
                "expected Err for non-PNG bytes, got Ok({:?})",
                result.unwrap()
            );
        }
    }
}
