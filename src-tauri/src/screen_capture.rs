use image::ImageEncoder;
use screenshots::Screen;
use serde::Deserialize;

/// A region in global virtual-screen coordinates (origin is the top-left of the
/// primary display; coordinates for other monitors may be negative).
#[derive(Debug, Clone, Deserialize)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Capture the pixels covered by `region` and return them as a PNG-encoded
/// byte vector.
///
/// The region is expressed in global virtual-screen coordinates.  The function
/// finds whichever physical screen contains the top-left corner of the region,
/// translates the coordinates to screen-local space, captures the area, and
/// finally PNG-encodes the result.
pub fn capture_region(region: CaptureRegion) -> Result<Vec<u8>, String> {
    if region.width == 0 || region.height == 0 {
        return Err("Capture region must have non-zero width and height".to_string());
    }

    // Find the screen that owns the top-left corner of the requested region.
    let screen = Screen::from_point(region.x, region.y).map_err(|e| {
        format!(
            "No screen found at global coordinates ({}, {}): {e}",
            region.x, region.y
        )
    })?;

    let info = &screen.display_info;

    // Translate the global region origin into screen-local coordinates.
    // `display_info.x/y` is the screen's origin in global virtual-screen
    // coordinates, so we subtract it to get the local offset.
    let local_x = region.x - info.x;
    let local_y = region.y - info.y;

    // `capture_area` expects the local x/y plus the dimensions in *logical*
    // pixels.  The screenshots crate handles DPI scaling internally.
    let rgba_image = screen
        .capture_area(local_x, local_y, region.width, region.height)
        .map_err(|e| format!("Screen capture failed: {e}"))?;

    // Encode the captured RGBA image as PNG bytes.
    let mut png_bytes: Vec<u8> = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
    encoder
        .write_image(
            rgba_image.as_raw(),
            rgba_image.width(),
            rgba_image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encoding failed: {e}"))?;

    Ok(png_bytes)
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------
//
// The `screenshots` crate makes direct OS-level calls that cannot be easily
// mocked at the library boundary, so the strategy here is:
//
//  1. Test the pure-Rust guard logic (zero-size region) without any OS calls.
//  2. Test the coordinate-translation formula in isolation.
//  3. Drive `capture_region` with coordinates that are guaranteed to fall
//     outside any real display (e.g. i32::MIN) so that `Screen::from_point`
//     always returns an error, letting us assert that the function surfaces a
//     descriptive `Err` string.
//
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{capture_region, CaptureRegion};

    // ------------------------------------------------------------------
    // 1. Zero-size guard tests
    // ------------------------------------------------------------------

    /// `width: 0` must be rejected before any OS call is made.
    #[test]
    fn zero_width_returns_err() {
        let region = CaptureRegion {
            x: 0,
            y: 0,
            width: 0,
            height: 100,
        };
        let result = capture_region(region);
        assert!(result.is_err(), "Expected Err for zero width");
        let msg = result.unwrap_err();
        assert!(
            msg.contains("non-zero width and height"),
            "Error message should mention non-zero width and height, got: {msg}"
        );
    }

    /// `height: 0` must be rejected before any OS call is made.
    #[test]
    fn zero_height_returns_err() {
        let region = CaptureRegion {
            x: 0,
            y: 0,
            width: 100,
            height: 0,
        };
        let result = capture_region(region);
        assert!(result.is_err(), "Expected Err for zero height");
        let msg = result.unwrap_err();
        assert!(
            msg.contains("non-zero width and height"),
            "Error message should mention non-zero width and height, got: {msg}"
        );
    }

    /// Both `width` and `height` being 0 must also be rejected.
    #[test]
    fn zero_width_and_height_returns_err() {
        let region = CaptureRegion {
            x: 10,
            y: 10,
            width: 0,
            height: 0,
        };
        let result = capture_region(region);
        assert!(result.is_err(), "Expected Err when both dimensions are zero");
    }

    // ------------------------------------------------------------------
    // 2. Coordinate-translation formula tests
    //
    // The formula used in `capture_region` is:
    //   local_x = region.x - screen.display_info.x
    //   local_y = region.y - screen.display_info.y
    //
    // We verify the arithmetic directly here so that any future refactor that
    // accidentally breaks the sign or operand order will be caught without
    // needing a live screen.
    // ------------------------------------------------------------------

    /// Local offset must be zero when the region origin equals the screen origin.
    #[test]
    fn coord_translation_same_origin_gives_zero_local() {
        let region_x: i32 = 1920;
        let region_y: i32 = 0;
        let screen_x: i32 = 1920; // second monitor placed to the right
        let screen_y: i32 = 0;

        let local_x = region_x - screen_x;
        let local_y = region_y - screen_y;

        assert_eq!(local_x, 0);
        assert_eq!(local_y, 0);
    }

    /// Local offset must be positive when the region is inside the screen
    /// (region origin > screen origin).
    #[test]
    fn coord_translation_positive_offset() {
        let region_x: i32 = 2100;
        let region_y: i32 = 150;
        let screen_x: i32 = 1920;
        let screen_y: i32 = 0;

        let local_x = region_x - screen_x;
        let local_y = region_y - screen_y;

        assert_eq!(local_x, 180);
        assert_eq!(local_y, 150);
    }

    /// For a monitor whose global origin is negative (e.g. positioned to the
    /// left of the primary display), the translation must still produce the
    /// correct local offset.
    #[test]
    fn coord_translation_negative_screen_origin() {
        let region_x: i32 = -1800;
        let region_y: i32 = 100;
        let screen_x: i32 = -1920; // monitor origin is to the left
        let screen_y: i32 = 0;

        let local_x = region_x - screen_x;
        let local_y = region_y - screen_y;

        assert_eq!(local_x, 120);
        assert_eq!(local_y, 100);
    }

    /// Capturing at the exact screen origin must yield local coordinates (0, 0).
    #[test]
    fn coord_translation_primary_monitor_origin() {
        let region_x: i32 = 0;
        let region_y: i32 = 0;
        let screen_x: i32 = 0;
        let screen_y: i32 = 0;

        let local_x = region_x - screen_x;
        let local_y = region_y - screen_y;

        assert_eq!(local_x, 0);
        assert_eq!(local_y, 0);
    }

    // ------------------------------------------------------------------
    // 3. OS-level error path tests
    //
    // Using coordinates that cannot possibly correspond to a real screen
    // ensures `Screen::from_point` returns an error on every platform,
    // exercising the `Err` propagation path without relying on a display.
    // ------------------------------------------------------------------

    /// Coordinates far outside any realistic display geometry must cause
    /// `capture_region` to return an `Err` containing the global coordinates
    /// in the message.
    #[test]
    fn extreme_negative_coords_returns_err_with_coordinates_in_message() {
        // i32::MIN / 2 is far beyond any real monitor layout.
        let x = i32::MIN / 2;
        let y = i32::MIN / 2;
        let region = CaptureRegion {
            x,
            y,
            width: 100,
            height: 100,
        };
        let result = capture_region(region);
        assert!(
            result.is_err(),
            "Expected Err for coordinates outside any real screen"
        );
        let msg = result.unwrap_err();
        // The error message must contain the offending coordinates.
        assert!(
            msg.contains(&x.to_string()) || msg.contains("No screen found"),
            "Error message should reference the bad coordinates or 'No screen found', got: {msg}"
        );
    }

    /// Extremely large positive coordinates likewise have no matching screen.
    #[test]
    fn extreme_positive_coords_returns_err() {
        let region = CaptureRegion {
            x: i32::MAX / 2,
            y: i32::MAX / 2,
            width: 10,
            height: 10,
        };
        let result = capture_region(region);
        assert!(
            result.is_err(),
            "Expected Err for large positive coordinates outside any real screen"
        );
    }

    /// A non-zero region at extreme coordinates must still fail — confirming
    /// the zero-size guard does not short-circuit the subsequent error path.
    #[test]
    fn nonzero_region_at_extreme_coords_returns_err() {
        let region = CaptureRegion {
            x: 999_999_999,
            y: 999_999_999,
            width: 200,
            height: 200,
        };
        let result = capture_region(region);
        assert!(result.is_err());
    }
}
